(function(){
	var CONTROL_KEY = 17,RIGHT_CLICK = 2;
	var keycode,timeout;
	var torrent_regex = /\.torrent/;
	var listeners = {};
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
		if (! document.webkitHidden) {
			// get client cookie of active tab
			chrome.extension.sendRequest({method: "storage-set-client_cookie", value:document.cookie});
			// check if settings have changed and adjust handlers accordingly
			install_configurable_handlers();
		}
	}
	
	function install_configurable_handlers(){
		/*	so, this is a step towards a more automated event
			handler registry, but for now some of this stuff
			still happens long-hand.
		 */
	
		/* install control + rightclick keyboard macro */
		chrome.extension.sendRequest({method: "storage-get-enable_keyboard_macro"}, function(response) {
			if ( response.value ) {
				// if "control + right click" macro enabled
				if (! listeners['keydown'])
					listeners['keydown'] = handle_keydown;
					document.body.addEventListener('keydown',handle_keydown,false);
				if (! listeners['up'])
					listeners['keyup'] = handle_keyup;
					document.body.addEventListener('keyup',handle_keyup,false);
			} else {
				// it may have been turned off in settings, so remove if it exists.
				if (listeners['keydown']) {
					document.body.removeEventListener('keydown', listeners['keydown']);
					listeners['keydown'] = null;
				}
				if (listeners['keyup']) {
					document.body.removeEventListener('keyup', listeners['keyup']);
					listeners['keyup'] = null;
				}
			}
		});

		/* install leftclick handling */
		chrome.extension.sendRequest({method: "storage-get-enable_leftclick"}, function(response) {
			//console.log(response.value, listeners['click']);
			if ( response.value ) {
				// if "Left click handling" enabled
				if (! listeners['click'])
					window.addEventListener('click',handle_leftclick,false);
					listeners['click'] = handle_leftclick;
			} else {
				if (listeners['click']) {
					// it has been turned off in settings, so remove if it exists.			
					window.removeEventListener('click', listeners['click']);
					listeners['click'] = null;
				}
			}
		});

		/* initialize regex for link checking */
 		chrome.extension.sendRequest({method: "storage-get-link_regex"}, function(response){
			torrent_regex = new RegExp(response.value);
		});
	}
	
	/* 	Send the document cookie to the backend so that deluge can masquerade as the user.
		Once on load, and then every time we become the active tab.  Also rescans handlers. */
	handle_visibilityChange()
	// watch for tab changes
	listeners['webkitvisibilitychange'] = document.addEventListener("webkitvisibilitychange", handle_visibilityChange, false);
	// contextmenu is always on, minimally
	listeners['contextmenu'] = window.addEventListener('contextmenu',handle_contextmenu,false);
}(document));