var fs = require("fs"),
	formidable = require("formidable");

module.exports = function(app, db)
{
	/////////////////////////////
	// ~~~ Helper Funtions ~~~ //
	/////////////////////////////

	function sendPage(req, res, view, pageData)
	{
		if (["/register","/login","/logout"].indexOf(req.path) === -1)
			req.session.lastPage = req.originalUrl;

		if (req.session.userId)
		{

			db.users.findOne(
				{ "_id": req.session.userId },
			function(err, user)
			{
				if (user) 
					res.render(view, { "page": pageData, "user": user });
				else 
					res.render(view, { "page": pageData });
			});
		}
		else
			res.render(view, { "page": pageData });
	}

	function tagSplit(stringTags)
	{
		return stringTags
			.replace(/^[\s,]+|[\s,]+$/gm,"")
			.split(/[\s,]*,[\s,]*/gm);
	}

	//////////////////
	// ~~~ Home ~~~ //
	//////////////////

	app.get("/", function (req, res)
	{
		db.tags.find().sort({ "ammount": -1 }).limit(10).exec(function (err, sideTags)
		{
			if(req.query.q)
			{
				var newTags = [];
				var queryTags = tagSplit(req.query.q);
				for(var t in queryTags)
				{
					tag = queryTags[t].toLowerCase();
					if (newTags.indexOf(tag) === -1)
						newTags.push(tag);
				}
					
				db.tags.find(
				{ 
					"_id": { "$in": newTags },
				}, function(err, tags)
				{
					if (tags.length < newTags.length || tags.length === 0)
						sendPage(req, res, "home", { "num": 0, "query": newTags.join(", "), "sideTags": sideTags});
					else 
					{
						var resultIds = tags[0].files;
						if (tags.length > 1)
							for (var i = 1; i < tags.length; i++)
							{
								resultIds = resultIds.filter(function(value) { return tags[i].files.indexOf(value) !== -1 });
							}

						db.files
							.find({ "_id": { "$in": resultIds } })
							.sort({ "voteScore": -1 }).limit(10).exec(function(err, files)
						{
							sendPage(req, res, "home", { "num": files.length, "query": newTags.join(", "), "results": files, "sideTags": sideTags });
						});
					}
				});
			}
			else
				db.files.find().sort({ "_id":-1 }).limit(10).exec(function(err, files)
				{
					sendPage(req, res, "home", { "num": -1, "results": files, "sideTags": sideTags});
				});
		});
	});

	//////////////////
	// ~~~ User ~~~ //
	//////////////////

	app.get("/user/:userId", function (req, res)
	{
		db.users
			.findOne({ "_id": parseInt(req.params.userId) },
		function(err, user)
		{
			if (user)
				res.redirect("/user/" + user._id + "/" + user.username);
			else
				sendPage(req, res, "404");
		});
	});

	app.get("/user/:userId/:username", function (req, res)
	{
		db.users
			.findOne({ "_id": parseInt(req.params.userId) },
		function(err, user)
		{
			if (user)
				if (req.params.username === user.username)
				{
					db.files
						.find({ "_id": { "$in": user.files.uploaded } })
						.sort({ "voteScore":-1 }).limit(10).exec(function(err, files)
					{
						sendPage(req, res, "user", { "user": user, "files": files});
					});
				}
				else 
					res.redirect("/user/" + user._id + "/" + user.username);
			else 
				sendPage(req, res, "404");
			
		});
	});

	//////////////////////
	// ~~~ Register ~~~ //
	//////////////////////

	app.get("/register", function (req, res)
	{
		sendPage(req, res, "register", { "failMessage": "" });
	});

	app.post("/register", function (req, res)
	{
		new formidable.IncomingForm().parse(req, function(err, fields) 
		{
			if (fields.password !== fields.retype_password)
				sendPage(req, res, "register", { "failMessage": "¡¿eRRoR?! Passwords don't match." });
			else 
			{
				db.registerUser(fields.username, fields.password, function(err, userId)
				{
					if (err) 
						sendPage(req, res, "register", { "failMessage": err.message });
					else 
					{
						req.session.userId = userId;
						res.redirect(req.session.lastPage ? req.session.lastPage : "/");
					}
				});
			}
		});
	});

	//////////////////////////
	// ~~~ Login/Logout ~~~ //
	//////////////////////////

	app.get("/login", function (req, res)
	{
		sendPage(req, res, "login", {});
	});

	app.post("/login", function (req, res)
	{
		new formidable.IncomingForm().parse(req, function(err, fields) 
		{
			db.loginUser(fields.username, fields.password, function(err, userId)
			{
				if (err) 
					sendPage(req, res, "login", { "failMessage": err.message });
				else 
				{
					req.session.userId = userId;
					res.redirect(req.session.lastPage ? req.session.lastPage : "/");
				}
			});
		});
	});

	app.get("/logout", function (req, res)
	{
		req.session.userId = null;
		res.clearCookie("sessionToken");
		res.redirect(req.session.lastPage ? req.session.lastPage : "/");
	});

	/////////////////////////
	// ~~~ File Viewer ~~~ //
	/////////////////////////

	function file(failMessage, req, res)
	{
		db.files
			.findOne({ _id: parseInt(req.params.fileId) })
			.populate(["uploaderId", "comments.commenterId", "tags"])
			.exec(function(err, file) 
		{
			if (file)
			{
				db.users.findOne(
					{ _id: req.session.userId ? req.session.userId : null },
				function(err, user)
				{
						var vote = "neither";
						if (user)
						{
							var upvoted = user.files.upvoted.indexOf(file._id),
								downvoted = user.files.downvoted.indexOf(file._id);

							if (upvoted !== -1)
								vote = "up";
							else if (downvoted !== -1)
								vote = "down";
						}

						sendPage(req, res, "file", 
						{ 
							"file": file, 
							"vote": vote,
							"failMessage": failMessage,
						});
				});
			}
			else
				sendPage(req, res, "404");
		});
	}

	app.get("/file/:fileId", function (req, res)
	{
		file(null, req, res);
	});

	//////////////////////
	// ~~~ Comments ~~~ //
	//////////////////////

	app.post("/file/:fileId", function (req, res)
	{
		if (!req.session.userId)
			res.redirect("/file/" + req.params.fileId);
		else
		{
			new formidable.IncomingForm().parse(req, function(err, fields) 
			{
				db.postComment(
					req.session.userId,
					parseInt(req.params.fileId),
					fields.comment,
				function(err)
				{
					if (err) 
						file(err.message, req, res);
					else 
						file(null, req, res);
				});
			});
		}
	});

	///////////////////////////////
	// ~~~ Upvotes/Downvotes ~~~ //
	///////////////////////////////

	function vote(vote, req, res)
	{
		db.postVote(req.session.userId, parseInt(req.params.fileId), vote, function(err, result)
		{
			if (err)
				res.send({ "type": "fail", "score": 666 });	
			else 	
				res.send(result);
		});
	}	

	app.get("/file/:fileId/upvote", function (req, res)
	{
		vote("up", req, res);
	});

	app.get("/file/:fileId/downvote", function (req, res)
	{
		vote("down", req, res);
	});

	////////////////////
	// ~~~ Upload ~~~ //
	////////////////////

	app.get("/upload", function (req, res)
	{
		sendPage(req, res, "upload", { "failMessage": "" });
	});

	app.post("/upload", function (req, res) 
	{
		if (!req.session.userId)
			sendPage(req, res, "upload", { "failMessage": "¡¿eRRoR?! Invalid Login." });
		else
		{
			new formidable.IncomingForm().parse(req, function(err, fields) 
			{
				db.uploadFile(
					req.session.userId,
					fields.name,
					fields.lang,
					fields.code,
					tagSplit(fields.tags),
				function(err, file)
				{
					if (err) 
						sendPage(req, res, "upload", { "failMessage": err.message });
					else 
						res.redirect("/file/" + file._id);
				});
			});
		}
	});

	/////////////////
	// ~~~ 404 ~~~ //
	/////////////////

	app.get("*", function (req, res)
	{
		res.status(404);
		sendPage(req, res, "404");
	});
}