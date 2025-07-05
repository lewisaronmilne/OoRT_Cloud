function tagSplit(tags_string)
{
	var init_tags = tags_string
		.replace(/^[\s,]+|[\s,]+$/gm,"")
		.toLowerCase()
		.split(/[\s,]*,[\s,]*/gm);

	tags_arr = []
	for(var t in init_tags)
	{
		tag = init_tags[t];
		if (tags_arr.indexOf(tag) === -1)
			tags_arr.push(tag)
	}
	return tags_arr;
}

module.exports = {
	"tagSplit": tagSplit,
};