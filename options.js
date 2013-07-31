(function(){
	var OPTIONS = [
		{
			id:'server_url', 
			def: 'http://localhost/user/deluge',
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
		{ id:'inpage_notification',	def: true, opts:{} },
		{ id:'server_pass', def: "", opts:{}},
		{ id:'enable_context_menu', def: true, opts:{} },
		{ id:'enable_keyboard_macro', def: true, opts:{} },
		{ id:'enable_leftclick', def: false, opts:{} },
		{ id:'link_regex', def: "\\.torrent$|torrents\\.php\\?.+|^magnet:", opts:{} }
	];

	// Saves options to localStorage.
	function save_options() {

		var messages = getElementsByClassName('validation-message');
		for ( var i = 0, l = messages.length; i < l; i++ ) {
			messages[i].parentNode.removeChild(messages[i]);
			messages[i] = null;
		}

		var validation_error = false;
		var mutator = [];
		for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
			var o = OPTIONS[i].id;
			var element = document.getElementById(o);
			var val = '';
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
			if (scrubber) val = scrubber(val);

			//validate
			if ( required && ( typeof val == 'undefined' || val == null || val == '' ) ) {
				errorNotice.innerHTML = 'Required field.';
				element.parentNode.insertBefore( errorNotice, element.nextSibling );
				validation_error = true;
			} else if ( validate && ! validate(val) ) {
				errorNotice.innerHTML = ( validate_message || 'Invalid entry.' );
				element.parentNode.insertBefore( errorNotice, element.nextSibling );
				validation_error = true;
			} else {
				mutator.push({opt_id: o, opt_val: val, opt_ele: element});
			}
		}
		
		if (! validation_error) {
			// if validation passed, then apply the mutator (save)
			for (var i = 0, l = mutator.length; i < l; i++) {
				var m = mutator[i];
				localStorage.setItem(m.opt_id, m.opt_val, m.opt_ele);
			}		
		}
	}

	// Restores state to saved value from localStorage.
	function restore_options() {
		for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
		  var o = OPTIONS[i].id;
		  var val = localStorage.getItem(o);
		  val = val === null ? OPTIONS[i].def : val;
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
	
	var option_fields = document.getElementsByClassName('option_field');
	for ( var i = 0, l = option_fields.length; i < l; i++) {
		var field = option_fields[i];
		var event = '';
		if ( field.type == 'checkbox' ) {
			event = 'change';
		} else {
			event = 'blur';
		}
		field.addEventListener(event,save_options,false);
	}
	restore_options();
	
	//special handler for combo regex field
	var elc = document.getElementById('enable_leftclick');
	var lcre = document.getElementById('link_regex');
	elc.addEventListener('change', function(e){
			if (this.checked ) { lcre.removeAttribute('disabled'); }
			else { lcre.disabled = 'disabled'; }
		}, false);
	
	//special handler to refire context menu registration
	var ecm = document.getElementById('enable_context_menu');
	ecm.addEventListener('change', function(e){
			if (this.checked ) { chrome.extension.sendRequest({method:'contextmenu', toggle:true}); }
			else { chrome.extension.sendRequest({method:'contextmenu', toggle:false}); }
		}, false);
		
	//display current version
	var manifest = chrome.runtime.getManifest();
	document.getElementById('version').innerHTML = manifest.version;
}(document))
	