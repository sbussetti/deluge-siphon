(function(){
	chrome.runtime.sendMessage(chrome.runtime.id, {
    method: "storage-get-deluge_server_url"
  }, {}, function(response) {
		var servurl = response.value;
		if (servurl) {
			document.getElementById('server-url').style.display = 'block';
			document.getElementById('server-url-link').href = servurl;
		} else {
			document.getElementById('reminder').innerHTML = 'Don\'t forget to configure your server info first!';
		}
	});
}(document));
