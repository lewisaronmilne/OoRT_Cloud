$(document).ready(function()
{
	function vote(vote)
	{
		if (vote.type === "fail")
		{
			$("#voteScore").html("<p><b>[Fail]</b></p>");
			$("#upvote").attr("class", "on");
			$("#downvote").attr("class", "on");
		}
		else
		{
			if (vote.type === "up")
					$("#upvote").attr("class", "on");
				else
					$("#upvote").attr("class", "off");

			if (vote.type === "down")
					$("#downvote").attr("class", "on");
				else
					$("#downvote").attr("class", "off");

			$("#voteScore").html("<p><b>[" + vote.score + "]</b></p>");
		}
	}

	$("#upvote").click(function()
	{
		$.get("/file/" + fileId + "/upvote")
			.done(vote);
	});

	$("#downvote").click(function()
	{
		$.get("/file/" + fileId + "/downvote")
			.done(vote);
	});
});