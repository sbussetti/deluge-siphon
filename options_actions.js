var OPTIONS = [
	{
		name:'server_url', 
		opts:{
			validate:function(string){
				if ( ! string )
					return string;

				var regexp = /^(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/
				return regexp.test(string) && ! string.match(/\/$/);				
			},
			validate_message:'Invalid server url.',
			required: true,
			scrubber:function(string){
				//no trailing / on url makes construction simpler..
				if ( ! string ) 
					return '';
					
				if ( string.substring(0,4) != 'http' )
					string = 'http://' + string;					
					
				li = string.length - 1
				if ( string.charAt(li) == '/' )
					string = string.substring(0, string.length-1);

				return string;					
			}
		},
	},
	{
		name:'inpage_notification',
		opts:{},
	},
	{
		name:'server_pass',
		opts:{}
	}
];

// Saves options to localStorage.
function save_options() {

	var messages = getElementsByClassName('validation-message');
	for ( var i = 0, l = messages.length; i < l; i++ ) {
		messages[i].parentNode.removeChild(messages[i]);
		messages[i] = null;
	}

	for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
	  var o = OPTIONS[i].name;
	  var element = document.getElementById(o);
	  var val;
	  if ( element.nodeName == 'INPUT' ) {
			if ( element.type == 'checkbox' ) {
				if ( element.checked )
					val = element.value;
			} else if ( element.type == 'text' || element.type == 'password' ) {
				val = element.value;
			}
	  } else {

	  }

	  var errorNotice = document.createElement('span');
	  errorNotice.style.color = 'red';
	  errorNotice.className = 'validation-message';
	  
	  var validate = OPTIONS[i].opts['validate'];
	  var validate_message = OPTIONS[i].opts['validate_message'];
	  var required = OPTIONS[i].opts['required'];
	  var scrubber = OPTIONS[i].opts['scrubber'];
	  //apply helpers
	  if (scrubber)
		val = scrubber(val);
	  
	  if ( required && ( typeof val == 'undefined' || val == null || val == '' ) ) {
		errorNotice.innerHTML = 'Required field.';
		element.parentNode.insertBefore( errorNotice, element.nextSibling );
	  } else if ( validate && ! validate(val) ) {
		errorNotice.innerHTML = ( validate_message || 'Invalid entry.' );
		element.parentNode.insertBefore( errorNotice, element.nextSibling );
	  } else {
		localStorage.setItem(o,val);
	  }
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
	  var o = OPTIONS[i].name;
	  var val = localStorage.getItem(o);
	  var element = document.getElementById(o);
	  if ( typeof val != 'undefined' && element ) {
		  if ( element.nodeName == 'INPUT' ) {
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

function getElementsByClassName(classname, node)  {
    if(!node) node = document.getElementsByTagName("body")[0];
    var a = [];
    var re = new RegExp('\\b' + classname + '\\b');
    var els = node.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
        if(re.test(els[i].className))a.push(els[i]);
    return a;
}