const mongoose = require("mongoose");
const bcrypt = require("bcrypt-nodejs");
const common = require("./common")

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

async function getNextId(name, done)
{
	counter = await counters.findOneAndUpdate(
		{ "_id": name},
		{ "$inc": { lastId: 1 } }, 
		{ "upsert": true }
	);

	if(counter)
		return counter.lastId + 1;
	else
		return 1;
};

///////////////////
// ~~~ users ~~~ //
///////////////////

async function registerUser(username, password, done)
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

	prev_user = await users.findOne({ "username": username });
	if (prev_user)
		return done(new Error("¡¿eRRoR?! Username already taken."), null);

	nextUserId = await getNextId("users"); 

	bcrypt.genSalt(10, function(err, salt)
	{
		bcrypt.hash(password, salt, null, function(err, hash)
		{
			user = new users(
			{
				"_id": nextUserId,
				"username": username,
				"password": hash,
				"created": new Date(),
			}).save();

			return done(null, nextUserId)
		});
	});
};

async function loginUser(username, password, done)
{
	username = username.toLowerCase();
	user = await users.findOne({ "username": username.toLowerCase() });

	if (!user)
		return done(new Error("¡¿eRRoR?! Unknown Username."), null);

	bcrypt.compare(password, user.password, function(err, result)
	{
		if (result)
			return done(null, user._id)
		else
			return done(new Error("¡¿eRRoR?! Incorrect Password."), null);
	});
};

///////////////////
// ~~~ files ~~~ //
///////////////////

async function uploadFile(uploaderId, inName, inLang, inCode, inTags, done)
{
	if (inName === "" || inName.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Name Field left blank."), null);

	if (inLang === "" || inLang.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Language Field left blank."), null);

	if (inCode === "" || inCode.match(/^ +$/))
		return done(new Error("¡¿eRRoR?! Code Box left empty."), null);

	nextFileId = await getNextId("files")

	var adjTags = common.tagSplit(inTags);
	var newTags = ["lang:" + inLang.toLowerCase()];
	for(var t in adjTags)
	{
		tag = adjTags[t];
		if (!tag.match(/.*:.*/))
			newTags.push(tag);
	}

	file = new files(
	{
		"_id": nextFileId,
		"uploaderId": uploaderId,
		"name": inName,
		"code": inCode,
		"tags": newTags,
		"created": new Date(),
		"voteScore": 0,
		"comments": [],
	}).save()

	users.findOneAndUpdate(
		{ "_id": uploaderId },
		{ "$push": { "files.uploaded": nextFileId } },
		{ "upsert": true }
	).exec();

	for(var t in newTags)
	{
		tags.findOneAndUpdate(
			{ "_id": newTags[t] },
			{
				"$push": { "files": nextFileId },
				"$inc": { "ammount": 1 }
			},
			{ "upsert": true }
		).exec();
	}

	return done(null, await file);
};

async function postComment(commenterId, fileId, inText)
{
	if (inText === "" || inText.match(/^ +$/))
		return { "success" : false, "message" : "¡¿eRRoR?! Comment Box left empty." };

	await files.findOneAndUpdate(
		{ "_id": fileId }, 
		{ "$push": { "comments": { "commenterId": commenterId, "text": inText, "created": new Date()} } }
	);

	return { "success" : true };
}

async function postVote(userId, fileId, inVote)
{
	if (!userId)
		return { "success" : false, "message" : "¡¿eRRoR?! Invalid Login." };

	user = await users.findOne( { "_id": userId } );

	if (!user)
		return { "success" : false, "message" : "¡¿eRRoR?! Invalid Login." };

	var vote = { "type": "", "score": 0 },
		voteChange = 0;
		upvoted = user.files.upvoted.indexOf(fileId),
		downvoted = user.files.downvoted.indexOf(fileId);

	if (inVote === "up")
	{
		if (upvoted === -1 && downvoted === -1)
		{
			vote.type = "up";
			user.files.upvoted.push(fileId);
			voteChange++;
		}

		if (upvoted !== -1)
		{
			vote.type = "neither";
			user.files.upvoted.splice(upvoted, 1);
			voteChange--;
		}

		if (downvoted !== -1)
		{
			vote.type = "up";
			user.files.upvoted.push(fileId);
			user.files.downvoted.splice(downvoted, 1);
			voteChange += 2;
		}
	}
	else if (inVote === "down")
	{
		if (upvoted === -1 && downvoted === -1)
		{
			vote.type = "down";
			user.files.downvoted.push(fileId);
			voteChange--;
		}

		if (upvoted !== -1)
		{
			vote.type = "down";
			user.files.downvoted.push(fileId);
			user.files.upvoted.splice(upvoted, 1);
			voteChange -= 2;
		}

		if (downvoted !== -1)
		{
			vote.type = "neither";
			user.files.downvoted.splice(downvoted, 1);
			voteChange++;
		}
	}

	await user.save()

	file = await files.findOneAndUpdate(
		{ "_id": fileId }, 
		{ "$inc": { voteScore: voteChange } }
	); 

	vote.score = file.voteScore + voteChange;

	return { "success" : true, "vote": vote };
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