( function () {
	var OPTIONS = [
		{
			id: 'deluge_server_url',
			def: 'http://localhost/user/deluge',
			opts: {
				validate: function ( string ) {
					if ( !string )
						return string;

					var regexp = /^(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
					return regexp.test( string ) && !string.match( /\/$/ );
				},
				validate_message: 'Invalid server url.',
				required: true,
				scrubber: function ( string ) {
					//no trailing / on url makes construction simpler..
					if ( !string )
						return '';

					if ( string.substring( 0, 4 ) != 'http' )
						string = 'http://' + string;

					li = string.length - 1;
					if ( string.charAt( li ) == '/' )
						string = string.substring( 0, string.length - 1 );

					return string;
				}
			},
		},
		{ id: 'inpage_notification', def: true, opts: {} },
		{ id: 'server_pass', def: "", opts: {} },
		{ id: 'enable_context_menu', def: true, opts: {} },
		{ id: 'enable_context_menu_with_options', def: true, opts: {} },
		{ id: 'enable_keyboard_macro', def: true, opts: {} },
		{ id: 'enable_leftclick', def: true, opts: {} },
		{ id: 'link_regex', def: '(\\/|^)(torrents|index)\\.php.*?(\\&|\\?)action=download|^magnet:|\\.torrent($|\\?)|(\\/|^)torrent(\\/|$)', opts: {} },
		{ id: 'enable_debug_logging', def: false, opts: {} },
	];

	// Saves options to localStorage.
	function save_options () {

		$( '.validation-message' ).empty();

		var validation_error = false;
		var mutator = [];
		for ( var ii = 0, ll = OPTIONS.length; ii < ll; ii++ ) {
			var o = OPTIONS[ ii ].id;
			var element = $( '#' + o );
			var val = '';
			if ( element.is( 'input[type=checkbox]' ) ) {
				if ( element.prop( 'checked' ) ) {
					val = element.val();
				}
			} else if ( element.is( 'input[type=text]' ) || element.is( 'input[type=password]' ) ) {
				val = element.val();
			} else {
				throw 'unknown element';
			}

			var errorNotice = document.createElement( 'span' );
			errorNotice.style.color = 'red';
			errorNotice.className = 'validation-message';

			var validate = OPTIONS[ ii ].opts.validate;
			var validate_message = OPTIONS[ ii ].opts.validate_message;
			var required = OPTIONS[ ii ].opts.required;
			var scrubber = OPTIONS[ ii ].opts.scrubber;

			//apply helpers
			if ( scrubber )
				val = scrubber( val );

			//validate
			if ( required && ( typeof val === 'undefined' || val === null || val === '' ) ) {
				errorNotice.innerHTML = 'Required field.';
				element.parentNode.insertBefore( errorNotice, element.nextSibling );
				validation_error = true;
			} else if ( validate && !validate( val ) ) {
				errorNotice.innerHTML = ( validate_message || 'Invalid entry.' );
				element.parentNode.insertBefore( errorNotice, element.nextSibling );
				validation_error = true;
			} else {
				mutator.push( { opt_id: o, opt_val: val, opt_ele: element[ 0 ] } );
			}
		}

		// console.log( mutator );

		if ( !validation_error ) {
			// if validation passed, then apply the mutator (save)
			for ( var iii = 0, lll = mutator.length; iii < lll; iii++ ) {
				var m = mutator[ iii ];
				localStorage.setItem( m.opt_id, m.opt_val, m.opt_ele );
			}
		}

        // BROADCAST SETTINGS CHANGE
        chrome.runtime.sendMessage( chrome.runtime.id, { method: 'settings-changed' } );
	}

	// Restores state to saved value from localStorage.
	function restore_options () {
		for ( var i = 0, l = OPTIONS.length; i < l; i++ ) {
			var o = OPTIONS[ i ].id;
			var val = localStorage.getItem( o );
			val = val === null ? OPTIONS[ i ].def : val;
			var element = $( '#' + o );
			if ( typeof val != 'undefined' && element ) {
				if ( element.is( 'input[type=checkbox]' ) ) {
					element.prop( 'checked', !!val );
				} else if ( element.is( 'input[type=text]' ) || element.is( 'input[type=password]' ) ) {
					element.val( val );
				} else {
					throw 'unknown element: ' + element;
				}
			}

			$( '#link_regex' ).prop( 'disabled', !$( '#enable_leftclick' ).prop( 'checked' ) );
		}
	}

	function clear_options () {
		localStorage.clear();
		restore_options();
        // BROADCAST SETTINGS CHANGE
        chrome.runtime.sendMessage( chrome.runtime.id, { method: 'settings-changed' } );
	}

	/* EVENT LISTENERS */

	$( '.option_field[type=checkbox]' ).each( function () {
		this.addEventListener( 'change', save_options, false );
	} );
	$( '.option_field' ).not( '[type=checkbox]' ).each( function () {
		this.addEventListener( 'blur', save_options, false );
	} );
	restore_options();
    save_options();

	//special handler for combo regex field
	$( '#enable_leftclick' )[ 0 ].addEventListener( 'change', function ( e ) {
		$( '#link_regex' ).prop( 'disabled', !this.checked );
	}, false );

	//display current version
	$( '#version' ).html( chrome.runtime.getManifest().version );

	//reset to defaults
	$( '#reset_options' )[ 0 ].addEventListener( 'click', function ( e ) {
		clear_options();
	} );

	//link to self on manage extensions page
	$( '#manage_extension' )[ 0 ].addEventListener( 'click', function ( e ) {
		chrome.tabs.create( { url: 'chrome://chrome/extensions/?id=' + chrome.runtime.id } );
	} );
} )( document );
