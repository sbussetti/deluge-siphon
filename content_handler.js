(function(){
	var port_to_controller;
	var CONTROL_KEY = 17,RIGHT_CLICK = 2;
	var keycode,timeout;
	var flag = 'Chrome_Extension_DelugeSiphon_Installed';

	function addToDeluge(url) { 
		chrome.extension.sendRequest({method:'addlink-todeluge', url:url});
	}
	function handle_keydown(e) {
		keycode = e.keyCode;
	}
	function handle_keyup(e) {
		keycode = null;
	}
	function handle_click(e) {
		var button = e.button;
		if ( keycode != CONTROL_KEY || button != RIGHT_CLICK )
			return;
		e.preventDefault();
		e.stopPropagation();
		addToDeluge(this.href);
	}
	/* install keyboard macro */
	if (!document[flag])  {			
		chrome.extension.sendRequest({method: "storage-enable_keyboard_macro"}, function(response) {
			if ( response.value ) {
					var anchor_tags = document.getElementsByTagName('a');
					for ( var i = 0, l = anchor_tags.length; i < l; i++ ) {
						var a = anchor_tags[i];
						a.addEventListener('contextmenu',handle_click,false);
					}
					document.body.addEventListener('keydown',handle_keydown,false);
					document.body.addEventListener('keyup',handle_keyup,false);
			} // else rely on default context menu method		  
		});
		document[flag] = true;
	}
}());