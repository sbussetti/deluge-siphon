/* global $, stopEvent, communicator, chrome, registerEventListener */
( function ( window, document ) {
  /* env check */
  if (!document || ! document.addEventListener || !document.body || !document.body.addEventListener) {
    return;
  }

  var CONTROL_KEY_DEPRESSED = false,
    SITE_META = {
      DOMAIN: window.location.host,
      TORRENT_REGEX:
      '^magnet:' 
      + '|(\\/|^)(torrent|torrents)(?=.*action=download)'
      + '|(\\/|^)(index|download)(\\.php)?(\\&|\\?|\\/)(?=.*torrent)'
      + '|\\.torrent'
      + '|\\/(torrent|download)(\\.php)?(\\/|\\?).+', // eslint-disable-line no-useless-escape
      TORRENT_URL_ATTRIBUTE: 'href',
      INSTALLED: false
    },
    log = function () {};

  function extract_torrent_url ( target ) {
    var $target = $( target ),
      $element = $target, torrent_match, torrent_url,
      attr = SITE_META.TORRENT_URL_ATTRIBUTE,
      regex = new RegExp( SITE_META.TORRENT_REGEX ), val;

    log( regex );

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
    var torrent_url = extract_torrent_url( e.target );
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

      // default label?
      communicator.sendMessage( {
        method: "storage-get-default_label"
      }, function ( response ) {

        var options = {
          method: 'addlink-todeluge',
          url: torrent_url,
          domain: SITE_META.DOMAIN
        };

        if (!!response && !!response.value) {
          options['plugins'] = {
            Label: response.value
          };
        }

        communicator.sendMessage( options );

      });

    }
  }

  function handle_keydown ( e ) {
    if ( e.ctrlKey ) {
      CONTROL_KEY_DEPRESSED = true;
    } else {
      CONTROL_KEY_DEPRESSED = false;
    }
  }

  function handle_keyup ( /*e*/ ) {
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

      var options = $( this ).serializeObject();

      // request download
      communicator.sendMessage( $.extend( {
        method: 'addlink-todeluge',
        domain: SITE_META.DOMAIN
      }, options ) );

      // // close modal
      $.modal.close();

    } );

    // enable/disable move-to location
    $modal.on( 'change', 'input[name="options[move_completed]"]', function ( /*e*/ ) {
      $modal.find( 'input[name="options[move_completed_path]"]' ).prop('disabled', !$( this ).is( ':checked' ));
    } );

    // add/remove falsey hidden field for checkboxes
    $modal.on( 'change', 'input[type=checkbox]', function ( /*e*/ ) {
      var $this = $(this),
        name = $this.attr('name');
      if ( $this.is( ':checked' ) ) {
        $modal.find('form input[name="' + name + '"][type="hidden"]').remove();
      } else {
        $modal.find('form').append($('<input/>', {type: 'hidden', name: name, value: ''}));
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
    var maxZ = Math.max.apply( null,
      $.map( $( 'body *' ), function ( e/*, n*/ ) {
        if ( $( e ).css( 'position' ) != 'static' )
          return parseInt( $( e ).css( 'z-index' ) ) || 1;
      } ) );

    // populate modal
    $( '#' + modalId )
      .html( modalTmpl.render( $.extend( {}, req ) ) )
      .modal( {
        blockerClass: modalId
      } )
      .parents( '.jquery-modal.blocker' )
      .css( 'z-index', ( maxZ || 1 ) + 10 );
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
    log('<<<<< SITE INIT >>>>>');
    // get regex for link checking from settings
    communicator.sendMessage( {
      method: 'storage-get-link_regex'
    }, function ( response ) {
      // if there's an override..

      log('GET LINK REGEX', response.value);
      if ( !!response.value ) {
        SITE_META.TORRENT_REGEX = response.value;
      }

      // check if settings have changed and adjust handlers accordingly
      install_configurable_handlers();

    }, function ( /*exc*/ ) {

      // treat this as a heartbeat.  on failure, close up shop (background page went away)

      document.removeEventListener( 'keydown', handle_keydown );
      document.removeEventListener( 'keyup', handle_keyup );
      document.removeEventListener( 'contextmenu', handle_contextmenu );
      document.body.removeEventListener( 'click', handle_leftclick );
      console.error('Background page went away');
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
    '<input type="checkbox" {{if config.move_completed}}checked="checked"{{/if}} value="true" name="options[move_completed]">' +
    ' ' +
    '<input {{if !config.move_completed }}disabled="disabled"{{/if}} type="text" value="{{>config.move_completed_path}}" name="options[move_completed_path]">' +
    '</div>' +

    '<div>' +
    '<label for="add_paused">add paused:</label>' +
    '<input type="checkbox" {{if config.add_paused}}checked="checked"{{/if}} value="true" name="options[add_paused]">' +
    '</div>' +

    '{{if plugins.Label && plugins.Label.length}}' +
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

      // don't turn on if we're on our deluge page..
      communicator.sendMessage( {
        method: 'storage-get-connections'
      }, function ( response ) {
        var conns = response.value || [],
          currentUrl = new URL(window.location.href),
          currentPathname = currentUrl.pathname.replace(/\/$/, "");
        for (var i = 0, l = conns.length; i < l; i++) {
          var connUrl = {pathname: ''};
          try { connUrl = new URL(conns[i].url); } catch (e) {}  // eslint-disable-line no-empty
          var connPathname = connUrl.pathname.replace(/\/$/, "");
          if (currentUrl.hostname == connUrl.hostname && currentPathname == connPathname) {
            log('[delugesiphon] not initializing on web ui page');
            return; // donesky
          }
        }

        // else continue

        // logging ...
        communicator.sendMessage( {
          method: 'storage-get-enable_debug_logging'
        }, function ( response ) {
          if ( !!response.value ) {
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
          communicator.observeMessage( function ( req/*, sendResponse*/ ) {

            log( 'RECV CONTENT MSG', req );

            if ( req.method === "add_dialog" ) {

              showModal( req );

            }
          } );

          // done
          log( 'INITIALIZED delugesiphon [' + chrome.runtime.id + ']' );

        } );
      });
    } )
    .observeDisconnect( function () {
      log( '[delugesiphon] Lost connection to background page (probably because it was reloaded). Please refresh this page.' );
    } )
    .init( !!chrome.runtime.id );

}( window, document ));
