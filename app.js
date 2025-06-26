var express = require("express"),
	morgan = require("morgan"),
	session = require("express-session"),
	mongodb = require("mongodb"),
	mongoose = require("mongoose"),
	mongoStore = require("connect-mongo")(session);

var port = 8080,
	app = express(),
	db = require("./app/models");

mongoose.connect("mongodb://localhost/oortdb");
mongoose.set("debug", true);

app.set("views", __dirname + "/views");
app.set("view engine", "jade");
app.use(morgan("dev"));
app.use(express.static(__dirname + "/public"));
app.use(session({
	name: "sessionToken",
	secret: "27a17963-96cf-4052-bad7-de4b942f8187",
	store: new mongoStore({ mongooseConnection: mongoose.connection }),
	resave: false,
	saveUninitialized: false,
}));
app.locals.pretty = true;

mongoose.connection.once("open", function()
{
	require("./app/routes")(app, db);
	app.listen(port);
	console.log("Server listening @ http://localhost:" + port);
});