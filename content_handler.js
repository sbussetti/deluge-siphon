(function(){
	var CONTROL_KEY = 17,RIGHT_CLICK = 2;
	var keycode,timeout;
	var flag = 'Chrome_Extension_DelugeSiphon_Installed';
	var torrent_regex = /\.torrent/;
	/*function getDelugeSession() {
		chrome.extension.sendRequest({method:'login-todeluge', silent:true});
	}*/
	function addToDeluge(url) { 
		chrome.extension.sendRequest({method:'addlink-todeluge', url:url});
	}
	function handle_keydown(e) {
		keycode = e.keyCode;
	}
	function handle_keyup(e) {
		keycode = null;
	}
	function handle_contextmenu(e) {

		var button = e.button;
		var element = e.target;
		if ( ! (keycode == CONTROL_KEY && button == RIGHT_CLICK && element.href) ) return;
		var href = element.href;
		e.preventDefault();
		e.stopPropagation();
		addToDeluge(href);
	}

	function handle_leftclick(e) {
		var element = e.target;
		if (!(element.href && element.href.match(torrent_regex))) return;
		var href = element.href;
		e.preventDefault();
		e.stopPropagation();
		addToDeluge(href);
	}
	function handle_visibilityChange() {
		if (! document.webkitHidden) 
			chrome.extension.sendRequest({method: "storage-set-client_cookie", value:document.cookie});
	}
	
	/* 	Send the document cookie to the backend so that deluge can masquerade as the user.
		Once on load, and then every time we become the active tab. */
	handle_visibilityChange()
	document.addEventListener("webkitvisibilitychange", handle_visibilityChange, false);
	/* ensure we just have a valid deluge web ui session */
	//getDelugeSession(); 
	if (!document[flag])  {	
	/* install keyboard macro */
		chrome.extension.sendRequest({method: "storage-get-enable_keyboard_macro"}, function(response) {
			if ( response.value ) {
				// if "Right click" macro enabled
					window.addEventListener('contextmenu',handle_contextmenu,false);
					document.body.addEventListener('keydown',handle_keydown,false);
					document.body.addEventListener('keyup',handle_keyup,false);
			} // else rely on default context menu method		  
		});

	/* install leftclick handling */
		chrome.extension.sendRequest({method: "storage-get-enable_leftclick"}, function(response) {
			if ( response.value ) {
				// if "Left click handling" enabled
					window.addEventListener('click',handle_leftclick,false);
			} 		  
		});

		/* initialize regex for link checking */
 		chrome.extension.sendRequest({method: "storage-get-link_regex"}, function(response){
			torrent_regex = new RegExp(response.value);
		});
		document[flag] = true;
	}
}(document));