const formidable = require("formidable");
const common = require("./common")

module.exports = function(app, db)
{
	/////////////////////////////
	// ~~~ Helper Funtions ~~~ //
	/////////////////////////////

	async function sendPage(req, res, view, pageData)
	{
		if (["/register","/login","/logout"].indexOf(req.path) === -1)
			req.session.lastPage = req.originalUrl;

		if (req.session.userId)
		{
			user = await db.users.findOne({ "_id": req.session.userId });

			if (user)
				res.render(view, { "page": pageData, "user": user });
			else
				res.render(view, { "page": pageData, "user": null });
		}
		else
		{
			res.render(view, { "page": pageData, "user": null });
		}
	}

	//////////////////
	// ~~~ Home ~~~ //
	//////////////////

	app.get("/", async function (req, res)
	{
		sideTags = await db.tags.find().sort({ "ammount": -1 }).limit(10).exec();

		if (!req.query.q)
		{
			files = await db.files.find().sort({ "_id":-1 }).limit(10).exec();
			sendPage(req, res, "home", { "num": -1, "results": files, "sideTags": sideTags});
			return;
		}

		var newTags = [];
		var queryTags = common.tagSplit(req.query.q);
		for(var t in queryTags)
		{
			tag = queryTags[t];
			if (newTags.indexOf(tag) === -1)
				newTags.push(tag);
		}

		tags = await db.tags.find({
			"_id": { "$in": newTags },
		});

		if (tags.length < newTags.length || tags.length === 0)
		{
			sendPage(req, res, "home", { "num": 0, "query": newTags.join(", "), "sideTags": sideTags});
			return;
		}

		var resultIds = tags[0].files;
		if (tags.length > 1)
			for (var i = 1; i < tags.length; i++)
			{
				resultIds = resultIds.filter(function(value) { return tags[i].files.indexOf(value) !== -1 });
			}

		files = await db.files.find({ "_id": { "$in": resultIds } }).sort({ "voteScore": -1 }).limit(10).exec()

		sendPage(req, res, "home", { "num": files.length, "query": newTags.join(", "), "results": files, "sideTags": sideTags });
	});

	//////////////////
	// ~~~ User ~~~ //
	//////////////////

	app.get("/user/:userId", async function (req, res)
	{
		user = await db.users.findOne({ "_id": parseInt(req.params.userId) });

		if (!user)
		{
			sendPage(req, res, "404");
			return;
		}

		res.redirect("/user/" + user._id + "/" + user.username);
	});

	app.get("/user/:userId/:username", async function (req, res)
	{
		user = await db.users.findOne({ "_id": parseInt(req.params.userId) });

		if (!user)
		{
			sendPage(req, res, "404");
			return;
		}

		if (req.params.username !== user.username)
		{
			res.redirect("/user/" + user._id + "/" + user.username);
			return;
		}

		files = await db.files
			.find({ "_id": { "$in": user.files.uploaded } })
			.sort({ "voteScore":-1 }).limit(10).exec()

		sendPage(req, res, "user", { "user": user, "files": files});
	});

	//////////////////////
	// ~~~ Register ~~~ //
	//////////////////////

	app.get("/register", function (req, res)
	{
		sendPage(req, res, "register", { "failMessage": "" });
	});

	app.post("/register", async function (req, res)
	{
		[fields, not_used] = await new formidable.IncomingForm().parse(req);

		if (fields.password[0] !== fields.retype_password[0])
		{
			sendPage(req, res, "register", { "failMessage": "¡¿eRRoR?! Passwords don't match." });
			return;
		}

		db.registerUser(fields.username[0], fields.password[0], function(err, userId)
		{
			if (err)
				sendPage(req, res, "register", { "failMessage": err.message });
			else
			{
				req.session.userId = userId;
				res.redirect(req.session.lastPage ? req.session.lastPage : "/");
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

	app.post("/login", async function (req, res)
	{
		[fields, not_used] = await new formidable.IncomingForm().parse(req);

		db.loginUser(fields.username[0], fields.password[0], function(err, userId)
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

	app.get("/logout", function (req, res)
	{
		delete req.session.userId;
		res.redirect(req.session.lastPage ? req.session.lastPage : "/");
	});

	/////////////////////////
	// ~~~ File Viewer ~~~ //
	/////////////////////////

	async function file_handle(comment_outcome, req, res)
	{
		file = await db.files
			.findOne({ _id: parseInt(req.params.fileId) })
			.populate(["uploaderId", "comments.commenterId", "tags"])
			.exec();

		if (!file)
		{
			sendPage(req, res, "404");
			return;
		}

		user = await db.users.findOne({ _id: req.session.userId ? req.session.userId : null });

		var vote = "neither";
		if (user)
		{
			var upvoted = user.files.upvoted.indexOf(file._id);
			var downvoted = user.files.downvoted.indexOf(file._id);

			if (upvoted !== -1)
				vote = "up";
			else if (downvoted !== -1)
				vote = "down";
		}

		failMessage = null;
		if (comment_outcome && !comment_outcome.success)
			failMessage = comment_outcome.message;

		sendPage(req, res, "file",
		{
			"file": file,
			"vote": vote,
			"failMessage": failMessage,
		});
	}

	app.get("/file/:fileId", function (req, res)
	{
		file_handle(null, req, res);
	});

	//////////////////////
	// ~~~ Comments ~~~ //
	//////////////////////

	app.post("/file/:fileId", async function (req, res)
	{
		if (!req.session.userId){
			res.redirect("/file/" + req.params.fileId);
			return;
		}

		[fields, not_used] = await new formidable.IncomingForm().parse(req);

		outcome = await db.postComment(req.session.userId, parseInt(req.params.fileId[0]), fields.comment[0]);

		file_handle(outcome, req, res);
	});

	///////////////////////////////
	// ~~~ Upvotes/Downvotes ~~~ //
	///////////////////////////////

	async function vote(vote, req, res)
	{
		vote_outcome = await db.postVote(req.session.userId, parseInt(req.params.fileId), vote);

		if (!vote_outcome.success)
			res.send({ "type": "fail", "score": 666 });	
		else 
			res.send(vote_outcome.vote);
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

	app.post("/upload", async function (req, res)
	{
		if (!req.session.userId)
		{
			sendPage(req, res, "upload", { "failMessage": "¡¿eRRoR?! Invalid Login." });
			return;
		}

		[fields, not_used] = await new formidable.IncomingForm().parse(req);

		db.uploadFile(
			req.session.userId,
			fields.name[0],
			fields.lang[0],
			fields.code[0],
			fields.tags[0],
			function(err, file)
			{
				if (err)
					sendPage(req, res, "upload", { "failMessage": err.message });
				else
					res.redirect("/file/" + file._id);
			}
		);
	});

	/////////////////
	// ~~~ 404 ~~~ //
	/////////////////

	app.get("*splat", function (req, res)
	{
		res.status(404);
		sendPage(req, res, "404");
	});
}
