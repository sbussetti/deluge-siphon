( function ( window, document ) {
	var CONTROL_KEY_DEPRESSED = false,
		SITE_META = {
			DOMAIN: window.location.host,
			TORRENT_REGEX: '\\.torrent',
			TORRENT_URL_ATTRIBUTE: 'href',
			INSTALLED: false
		},
		LISTENERS = {},
		log = function () {};

	function extract_torrent_url ( target, site_meta ) {
		var $target = $( target ),
			$element = $target, torrent_match, torrent_url,
			attr = site_meta.TORRENT_URL_ATTRIBUTE,
			regex = new RegExp( site_meta.TORRENT_REGEX ), val;

		if ( !$element.attr( attr ) )
			$element = $target.parent( 'a' );
		if ( !$element.attr( attr ) )
			$element = $target.children( 'a' );
		if ( !$element.length ) return;
		val = attr === 'href' ? $element[ 0 ].href : $element.attr( attr );
		if ( !!val )
			torrent_match = val.match( regex );
		log( regex, val, torrent_match );
		if ( !!torrent_match )
			torrent_url = torrent_match.input;
		return torrent_url;
	}

	function process_event ( e, with_options ) {
		// process the event and if possible, sends the extracted link to the controller
		var torrent_url = extract_torrent_url( e.target, SITE_META );
		if ( !torrent_url ) return;
		log( 'Extrated torrent_url: `' + torrent_url + '`' );
		stopEvent( e );

		if ( !!with_options ) {

			communicator.sendMessage( {

				method: 'addlink-todeluge:withoptions',
				url: torrent_url,
				domain: SITE_META.DOMAIN

			}, showModal );

		} else {

			communicator.sendMessage( {

				method: 'addlink-todeluge',
				url: torrent_url,
				domain: SITE_META.DOMAIN

			} );

		}
	}

	function handle_keydown ( e ) {
		if ( e.ctrlKey ) {
			CONTROL_KEY_DEPRESSED = true;
		} else {
			CONTROL_KEY_DEPRESSED = false;
		}
	}

	function handle_keyup ( e ) {
		CONTROL_KEY_DEPRESSED = false;
	}

	function handle_contextmenu ( e ) {
		log( 'RIGHT CLICK', 'CTRL:', CONTROL_KEY_DEPRESSED );
		// handles the original control + rightclick macro
		if ( CONTROL_KEY_DEPRESSED ) process_event( e, true );
	}

	function handle_leftclick ( e ) {
		log( 'LEFT CLICK', 'CTRL:', CONTROL_KEY_DEPRESSED );
		process_event( e, CONTROL_KEY_DEPRESSED );
	}

	function handle_visibilityChange () {
		if ( !document.webkitHidden && document.webkitVisibilityState != 'prerender' ) {
			site_init();
		}
	}

	function modal_init () {
		var modalId = 'delugesiphon-modal-' + chrome.runtime.id;
		var $modal = $( '#' + modalId );
		if ( !$modal.length ) {
			$modal = $( '<div/>', { 'id': modalId } );
		}
		$( 'body' ).append( $modal );

		// initialize modal.. delgation etc..
		// Set up modal for options add
		// submit handler
		$modal.on( 'submit', 'form', function ( e ) {
			e.preventDefault();

			// request download
			communicator.sendMessage( $.extend( {
				method: 'addlink-todeluge',
				domain: SITE_META.DOMAIN
			}, $( this ).serializeObject() ) );

			// close modal
			$.modal.close();

		} );

		// show/hide move-to location
		$modal.on( 'change', 'input[name="options[move_completed]"]', function ( e ) {

			var $pathInput = $( '#' + modalId + ' input[name="options[move_completed_path]"]' );
			if ( $( this ).is( ':checked' ) ) {
				$pathInput.show();
			} else {
				$pathInput.hide();
			}

		} );

		$modal.on( 'click', 'button[name=cancel]', function ( e ) {
			e.preventDefault();

			$.modal.close();
		} );
	}

	function showModal ( req ) {

		log( 'Show Modal', req );

		var modalId = 'delugesiphon-modal-' + chrome.runtime.id;
        var maxZ = Math.max.apply(null, 
            $.map($('body *'), function(e,n) {
                if ($(e).css('position') != 'static')
                    return parseInt($(e).css('z-index')) || 1;
        }));

		// populate modal
		$( '#' + modalId )
			.html( modalTmpl.render( $.extend( {}, req ) ) )
			.modal( {} )
            .parents('.jquery-modal.blocker')
            .css('z-index', (maxZ || 1) + 10);
	}

	function install_configurable_handlers () {
		/*
		  so, this provides a rudimentary event
		  handler registry.  Following this pattern
		  lets us turn the event handlers on and off on the
		  fly based on a users settings.  Without it they'd
		  have to refresh any open tabs after a config change.
		*/

		/* install control + rightclick keyboard macro */
		communicator.sendMessage( {
			method: "storage-get-enable_keyboard_macro"
		}, function ( response ) {
			if ( response.value ) {
				// if "control + right click" macro enabled
				registerEventListener( 'keydown', handle_keydown );
				registerEventListener( 'keyup', handle_keyup );
				registerEventListener( 'contextmenu', handle_contextmenu );
			} else {
				// disable
				document.removeEventListener( 'keydown', handle_keydown );
				document.removeEventListener( 'keyup', handle_keyup );
				document.removeEventListener( 'contextmenu', handle_contextmenu );
			}
		} );

		/* install leftclick handling */
		communicator.sendMessage( {
			method: "storage-get-enable_leftclick"
		}, function ( response ) {
			if ( !!response.value ) {
				registerEventListener( 'click', handle_leftclick, document.body );
			} else {
				document.body.removeEventListener( 'click', handle_leftclick );
			}
		} );
	}

	function site_init () {
		/*
		  basically this is where per-site changes/hacks etc go when we need to add support
		  for specific sites.  RIP TVTorrents' weird code.
		*/

		// get regex for link checking from settings
		communicator.sendMessage( {
			method: 'storage-get-link_regex'
		}, function ( response ) {
			SITE_META.TORRENT_REGEX = response.value;
			// check if settings have changed and adjust handlers accordingly
			install_configurable_handlers();

		}, function ( exc ) {

			// treat this as a heartbeat.  on failure, close up shop (background page went away)

			document.removeEventListener( 'keydown', handle_keydown );
			document.removeEventListener( 'keyup', handle_keyup );
			document.removeEventListener( 'contextmenu', handle_contextmenu );
			document.body.removeEventListener( 'click', handle_leftclick );

            // notify user to reload (we can't, background page is gone..)
		} );
	}

	var modalTmpl = $.templates(
		'<form action="javascript:void(0);">' +

		'<h3> {{:info.name}} </h3>' +

		'<div class="note"> {{>url}} </div>' +
		'<input type="hidden" value="{{>url}}" name="url"/>' +

		'<div>' +
		'<label for="download_location">download to:</label>' +
		'<input type="text" value="{{>config.download_location}}" name="options[download_location]">' +
		'</div>' +


		'<div>' +
		'<label for="move_completed">move completed:</label>' +
		'<input type="checkbox" {{if config.move_completed}}checked="checked"{{/if}} value="yes" name="options[move_completed]">' +
		' ' +
		'<input style="{{if !config.move_completed }}display: none;{{/if}}" type="text" value="{{>config.move_completed_path}}" name="options[move_completed_path]">' +
		'</div>' +

		'<div>' +
		'<label for="add_paused">add paused:</label>' +
		'<input type="checkbox" {{if config.add_paused}}checked="checked"{{/if}} value="yes" name="options[add_paused]">' +
		'</div>' +

		'{{if plugins.Label}}' +
        '<div class="plugin">' +
            '<label for="label">label:</label>' +
            '<select name="plugins[Label]">' +
                '<option value="">-----</option>' +
                '{{for plugins.Label}}' + 
                '<option value="{{>#data}}">{{>#data}}</option>' +
                '{{/for}}' +
            '</select>' +
		'</div>' +
        '{{/if}}' +

		'<div class="buttons">' +
		'<input type="submit" value="Add" name="submit"/> ' +
		'<button name="cancel">Cancel</button>' +
		'</div>' +

		'</form>'
	);

	/* MAIN */
	communicator
		.observeConnect( function () {

			// logging ...
			communicator.sendMessage( {
				method: 'storage-get-enable_debug_logging'
			}, function ( response ) {
				if ( !!response && !!response.value ) {
					log = function () {
						console.log.apply( console, [ '[delugesiphon]', '[' + document.URL + ']' ].concat( Array.prototype.slice.call( arguments ) ) );
					};
					log( 'Debug logging enabled' );
				}

				// watch for tab changes
				registerEventListener( 'webkitvisibilitychange', handle_visibilityChange );

				// site specific init..
				site_init();

				// modal init
				modal_init();

				// listen for messages from the background
				communicator.observeMessage( function ( req, sendResponse ) {

					log( 'RECV CONTENT MSG', req );

					if ( req.method === "add_dialog" ) {

						showModal( req );

					}
				} );

				// done
				log( 'INITIALIZED delugesiphon [' + chrome.runtime.id + ']' );

			} );
		} )
		.observeDisconnect( function () {
			console.log( '[delugesiphon] Lost connection to background page (probably because it was reloaded). Please refresh this page.' );
		} )
		.init( !!chrome.runtime.id );

}( window, document ));
