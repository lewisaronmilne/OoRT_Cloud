var mongoose = require("mongoose"),
	bcrypt = require("bcrypt-nodejs");

/////////////////////
// ~~~ schemas ~~~ //
/////////////////////

var counterSchema = new mongoose.Schema(
{
	"_id": String,
	"lastId": Number,
});
var counters = mongoose.model("counters", counterSchema);

var userSchema = new mongoose.Schema(
{
	"_id": Number,
	"username": { type: String, unique: true },
	"password": String,
	"created": Date,
	"files":
	{
		"uploaded": [{ type: Number, ref: "files" }], 
		"upvoted": [{ type: Number, ref: "files" }],
		"downvoted": [{ type: Number, ref: "files" }],	
	},
});
var users = mongoose.model("users", userSchema);

var fileSchema = new mongoose.Schema(
{
	"_id": Number,
	"uploaderId": { type: Number, ref: "users" },
	"name": String,
	"language": String,
	"code": String,
	"tags": [{ type: String, ref: "tags" }],
	"created": Date,
	"voteScore": Number,
	"comments": 
	[{
		"commenterId": { type: Number, ref: "users" },
		"text": String,
		"created": Date
	}],
});
var files = mongoose.model("files", fileSchema);

var tagSchema = new mongoose.Schema(
{
	"_id": String,
	"ammount": Number,
	"files": [{ type: Number, ref: "files" }],
});
var tags = mongoose.model("tags", tagSchema);


///////////////////////////
// ~~~ Miscellaneous ~~~ //
///////////////////////////

function getNextId(name, done)
{
	counters.findOneAndUpdate(
		{ "_id": name},
		{ "$inc": { lastId: 1 } }, 
		{ "upsert": true }, 
	function(err, counter)
	{
		if(counter)
			return done(counter.lastId + 1);
		else
			return done(1);
	});
};

///////////////////
// ~~~ users ~~~ //
///////////////////

function registerUser(username, password, done)
{
	if (username === "")
		return done(new Error("¡¿eRRoR?! Username Field left blank."), null);
	
	if (password.length < 8)
		return done(new Error("¡¿eRRoR?! Password must be eight characters or more."), null);

	if (!password.match(/.*[0-9].*/))
		return done(new Error("¡¿eRRoR?! Password must contain at least one Number."), null);

	if (!password.match(/.*[a-zA-Z].*/))
		return done(new Error("¡¿eRRoR?! Password must contain at least one Letter."), null);

	username = username.toLowerCase();
	users.findOne(
		{ "username": username },
	function(err, user) 
	{
		if (user)
			return done(new Error("¡¿eRRoR?! Username already taken."), null);

		getNextId("users", function(id)
		{
			bcrypt.genSalt(10, function(err, salt)
			{
				bcrypt.hash(password, salt, null, function(err, hash)
				{
					new users(
					{
						"_id": id,
						"username": username,
						"password": hash,
						"created": new Date(),
					}).save(function(err, user)
					{
						return done(null, user._id)
					});
				});
			});
		});
	});
};

function loginUser(username, password, done)
{
	username = username.toLowerCase();
	users.findOne(
		{ "username": username.toLowerCase() },
	function(err, user)
	{
		if (!user)
			return done(new Error("¡¿eRRoR?! Unknown Username."), null);

		bcrypt.compare(password, user.password, function(err, result)
		{
			if (result)
				return done(null, user._id)
			else
				return done(new Error("¡¿eRRoR?! Incorrect Password."), null); 
		});
	});
};

///////////////////
// ~~~ files ~~~ //
///////////////////

function uploadFile(uploaderId, inName, inLang, inCode, inTags, done)
{
	if (inName === "" || inName.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Name Field left blank."), null);

	if (inLang === "" || inLang.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Language Field left blank."), null);

	if (inCode === "" || inCode.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Code Box left empty."), null);

	getNextId("files", function(id)
	{
		var newTags = ["lang:" + inLang.toLowerCase()];
		for(var t in inTags)
		{
			tag = inTags[t].toLowerCase();
			if (tag !== "" && !tag.match(/.*:.*/) && newTags.indexOf(tag) === -1)
				newTags.push(tag);
		}

		new files(
		{
			"_id": id,
			"uploaderId": uploaderId,
			"name": inName,
			"code": inCode,
			"tags": newTags,
			"created": new Date(),
			"voteScore": 0,
			"comments": [],
		}).save(function(err, file)
		{	
			users.findOneAndUpdate(
				{ "_id": uploaderId },
				{ "$push": { "files.uploaded": file._id } },
			function(err, user) 
			{
				for(var t in newTags)
				{
					tags.findOneAndUpdate(
						{ "_id": newTags[t] },
						{ 
							"$push": { "files": file._id },
							"$inc": { "ammount": 1 }
						},
						{ "upsert": true }).exec();
				}
				return done(null, file);
			});
		});
	});
};

function postComment(commenterId, fileId, inText, done)
{
	if (inText === "" || inText.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Comment Box left empty."));

	files.findOneAndUpdate(
		{ "_id": fileId }, 
		{ "$push": { "comments": { "commenterId": commenterId, "text": inText, "created": new Date()} } },
	function(err, file) 
	{
		return done(null);
	});
}

function postVote(userId, fileId, inVote, done)
{
	if (!userId)
		return done(new Error("¡¿eRRoR?! Invalid Login."), null);

	users.findOne(
		{ "_id": userId },
	function(err, user)
	{
		var vote = { "type": "", "score": 0 },
			voteChange = 0;
			upvoted = user.files.upvoted.indexOf(fileId),
			downvoted = user.files.downvoted.indexOf(fileId);

		if (inVote === "up")
		{
			if (downvoted !== -1)
			{
				user.files.downvoted.splice(downvoted, 1);
				voteChange++;
			}

			if (upvoted !== -1)
			{
				vote.type = "neither";
				user.files.upvoted.splice(upvoted, 1);
				voteChange--;
			}
			else
			{
				vote.type = "up";
				user.files.upvoted.push(fileId);
				voteChange++;
			}
		}
		else if (inVote === "down")
		{
			if (upvoted !== -1)
			{
				user.files.upvoted.splice(upvoted, 1);
				voteChange--;
			}

			if (downvoted !== -1)
			{
				vote.type = "neither";
				user.files.downvoted.splice(downvoted, 1);
				voteChange++;
			}
			else
			{
				vote.type = "down";
				user.files.downvoted.push(fileId);
				voteChange--;
			}
		}

		user.save(function(err)
		{
			files.findOneAndUpdate(
				{ "_id": fileId }, 
				{ "$inc": { voteScore: voteChange } }, 
			function(err, file)
			{
				vote.score = file.voteScore + voteChange;
				return done(null, vote);
			});
		});
	});	
}

/////////////////////
// ~~~ exports ~~~ //
/////////////////////

module.exports = 
{
	"users": users,
	"files": files,
	"tags": tags,
	"registerUser": registerUser,
	"loginUser": loginUser,
	"uploadFile": uploadFile,
	"postComment": postComment,
	"postVote": postVote
} 

/////////////////////////////
// ~~~ old token stuff ~~~ //
/////////////////////////////

// uuid = require("node-uuid"),

// var tokenSchema = new mongoose.Schema(
// {
// 	"_id": String,
// 	"userId": { type: Number, ref: "users" },
// 	"lastUsed": Date,
// });
// var tokens = mongoose.model("tokens", tokenSchema);

// 	new tokens(
// 	{
// 		"_id": uuid.v4(),
// 		"userId": user._id,
// 		"lastUsed": new Date(),
// 	})