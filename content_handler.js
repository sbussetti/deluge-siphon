(function(){
	var port_to_controller = chrome.extension.connect({name: "delugesiphon"});
	var CONTROL_KEY = 17,RIGHT_CLICK = 2;
	var keycode,timeout;

	port_to_controller.onMessage.addListener(function(msg){
		if ( msg.error ) {
			//error
			message('error',msg.error,msg.notify);
		} else if ( msg.message ) {
			//message
			message('message',msg.message,msg.notify);
		} else {
			//error
			message('error','Extension Communications Error.',msg.notify);
		}
	});

	function message(type,msg_txt,notify){
		if ( notify ) {
			if ( timeout )
				clearTimeout(timeout);

			var notifyEle = document.getElementById('delugesiphon-popup-notify');
			var icon_col = document.getElementById('delugesiphon-icon'),message_col = document.getElementById('delugesiphon-message');
			if ( !notifyEle) {
				notifyEle = document.createElement('div');
				notifyEle.id = 'delugesiphon-popup-notify';

				icon_col = document.createElement('div'), message_col = document.createElement('div');
				icon_col.id = 'delugesiphon-icon',	message_col.id = 'delugesiphon-message';
				notifyEle.appendChild(icon_col); notifyEle.appendChild(message_col);
				document.body.appendChild(notifyEle);
			}
			var icon = chrome.extension.getURL('icon.png');
			icon_col.style.backgroundImage = "url('"+icon+"')";
			message_col.innerHTML = msg_txt;

			timeout=setTimeout(function(){
				document.body.removeChild(notifyEle);
			},5000);
			

		} else {
			var label = ( type == 'message' ? 'MESSAGE' : 'ERROR' );
			console.log('MESSAGE:',msg_txt);
		}
	}

	function addToDeluge(url) { port_to_controller.postMessage(url); }

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

	var flag = 'Chrome_Extension_DelugeSiphon_Installed';
	if (!document[flag])  {
		var anchor_tags = document.getElementsByTagName('a');
		for ( var i = 0, l = anchor_tags.length; i < l; i++ ) {
			var a = anchor_tags[i];
			a.addEventListener('contextmenu',handle_click,false);
		}
		document.body.addEventListener('keydown',handle_keydown,false);
		document.body.addEventListener('keyup',handle_keyup,false);
	}
	document[flag] = true;
}());