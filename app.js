const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");

const port = 8080;
const db_url = "mongodb://localhost/oortdb"

const app = express();
const db = require("./app/models");

mongoose.connect(db_url);
mongoose.set("debug", true);

app.set("views", __dirname + "/views");
app.set("view engine", "pug");
app.use(express.static(__dirname + "/static"));
app.use(session({
	name: "sessionToken",
	secret: "27a17963-96cf-4052-bad7-de4b942f8187",
	resave: false,
	saveUninitialized: false,
}));
app.locals.pretty = true;

mongoose.connection.once("open", function()
{
	require("./app/routes")(app, db);
	app.listen(port);
});