var mongodb = require("mongodb"),
	mongoose = require('mongoose');

mongoose.connect("mongodb://localhost/oortdb");
mongoose.connection.once("open", function()
{
	mongoose.connection.db.dropDatabase(function ()
	{
		process.exit();
	});	
});