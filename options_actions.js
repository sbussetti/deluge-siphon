var OPTIONS = ['server_url', 'inpage_notification', 'server_pass'];

// Saves options to localStorage.
function save_options() {

	for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
	  var o = OPTIONS[i];
	  var element = document.getElementById(o);
	  var val;
	  if ( element.nodeName == 'INPUT' ) {
			if ( element.type == 'checkbox' ) {
				console.log(element.checked);
				if ( element.checked )
					val = element.value;
			} else if ( element.type == 'text' || element.type == 'password' ) {
				val = element.value;
			}
	  } else {

	  }
	  
	  localStorage.setItem(o,val);
	}
	// Update status to let user know options were saved.
	var status = document.getElementById("status");
	status.innerHTML = "Options Saved.";
	setTimeout(function() {
		status.innerHTML = "";
	}, 2000);

}

// Restores select box state to saved value from localStorage.
function restore_options() {
	for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
	  var o = OPTIONS[i];
	  var val = localStorage.getItem(o);
	  var element = document.getElementById(o);
	  if ( typeof val != 'undefined' && element ) {
		  if ( element.nodeName == 'INPUT' ) {
			  console.log(element.type);
			  if ( element.type == 'checkbox' ) {
				  if ( val )
					  element.checked = true;
			  } else if ( element.type == 'text' || element.type == 'password' ) {
				  element.value = val;
			  }
		  } else { //selects.. radio groups..

		  }
	  }
	}
}

function clear_options() {
	localStorage.clear();
	save_options();
}