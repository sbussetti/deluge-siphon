(function(window, document){
  var CONTROL_KEY = 17,
      RIGHT_CLICK = 2,
      CONTROL_KEY_DEPRESSED = false,
      SITE_META = {
        DOMAIN: window.location.host,
        TORRENT_REGEX: '\\.torrent',
        TORRENT_URL_ATTRIBUTE: 'href',
        INSTALLED: false
      },
      LISTENERS = {};

  function extract_torrent_url(target, site_meta){
    var $target = $(target),
        $element = $target,
        torrent_match,
        torrent_url,
        attr = site_meta.TORRENT_URL_ATTRIBUTE,
        regex = new RegExp(site_meta.TORRENT_REGEX),
        val;

    if (!$element.attr(attr)) $element = $target.parent('a');
    if (!$element.attr(attr)) $element = $target.children('a');
    if (!$element.length) return;
    val = attr === 'href' ? $element[0].href : $element.attr(attr);
    if (!!val) torrent_match = val.match(regex);
    console.log(regex, val, torrent_match);
    if (!!torrent_match) torrent_url = torrent_match.input;
    return torrent_url;
  }

  function process_event(e){
    //process the event and if possible, sends the extracted link to the controller
    var torrent_url = extract_torrent_url(e.target, SITE_META);
    if (!torrent_url) return;
    console.log('Extrated torrent_url: `'  + torrent_url + '`');
    stopEvent(e);
    communicator.sendMessage({
      method:'addlink-todeluge',
      url:torrent_url,
      domain: SITE_META.DOMAIN
    });
  }

  function handle_keydown(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = true;
  }

  function handle_keyup(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = false;
  }

  function handle_contextmenu(e) {
    // handles the original control + rightclick macro
    if (CONTROL_KEY_DEPRESSED) process_event(e);
  }

  function handle_leftclick(e) {
    process_event(e);
  }

  function handle_visibilityChange() {
    if (! document.webkitHidden && document.webkitVisibilityState != 'prerender') {
      site_init();
    }
  }

  function install_configurable_handlers(){
    /*
      so, this provides a rudimentary event
      handler registry.  Following this pattern
      lets us turn the event handlers on and off on the
      fly based on a users settings.  Without it they'd
      have to refresh any open tabs after a config change.

      TODO: functionalize setup and teardown of LISTENERS;
      this isn't DRY..
    */

    /* install control + rightclick keyboard macro */
    communicator.sendMessage({
      method: "storage-get-enable_keyboard_macro"
    }, function(response) {
      if ( response.value ) {
        // if "control + right click" macro enabled
        registerEventListener('keydown', handle_keydown);
        registerEventListener('keyup', handle_keyup);
        registerEventListener('contextmenu', handle_contextmenu);
      } else {
        // disable
        document.removeEventListener('keydown', handle_keydown);
        document.removeEventListener('keyup', handle_keyup);
        document.removeEventListener('contextmenu', handle_contextmenu);
      }
    });

    /* install leftclick handling */
    communicator.sendMessage({
      method: "storage-get-enable_leftclick"
    }, function(response) {
      if (!!response.value) {
        registerEventListener('click', handle_leftclick, document.body);
      } else {
        document.body.removeEventListener('click', handle_leftclick);
      }
    });
  }

  function site_init(){
    /*
      basically this is where per-site changes/hacks etc go when we need to add support
      for specific sites.  RIP TVTorrents' weird code.
    */

    // get regex for link checking from settings
    communicator.sendMessage({
      method: 'storage-get-link_regex'
    }, function(response){
      SITE_META.TORRENT_REGEX = response.value;
      // check if settings have changed and adjust handlers accordingly
      install_configurable_handlers();

      // watch for tab changes
      registerEventListener('webkitvisibilitychange', handle_visibilityChange);

    }, function(exc) {
      // treat this as a heartbeat.  on failure, close up shop (background page went away)
      document.removeEventListener('keydown', handle_keydown);
      document.removeEventListener('keyup', handle_keyup);
      document.removeEventListener('contextmenu', handle_contextmenu);
      document.body.removeEventListener('click', handle_leftclick);

      // notify user to reload
    });
  }

  /* MAIN */
  communicator.init(!!chrome.runtime.id, function () {

    var modalId = 'delugesiphon-modal-' + chrome.runtime.id,
        modalTmpl = $.templates(
          '<form action="javascript:void(0);">' +
            '<div>' +
              '<label for="url">url:</label>' +
              '<input type="text" value="{{>url}}" name="url">' +
            '</div><div>'  +
              '<label for="download_location">name:</label>' +
              '<input type="text" value="{{>info.name}}" name="options[download_location]">'+
            '</div><div>'  +
              '<label for="download_location">location:</label>' +
              '<input type="text" value="{{>config.download_location}}" name="options[download_location]">'+
            '</div><div>'  +
              '<label for="move_completed">move completed:</label> ' +
              '<input type="checkbox" {{if config.move_completed}}checked="checked"{{/if}} value="yes" name="options[move_completed]">' +
              '<input type="text" value="{{>config.move_completed_path}}" name="options[move_completed_path]">'+
            '</div><div>'  +
              '<label for="add_paused">add paused:</label>' +
              '<input type="checkbox" {{if config.add_paused}}checked="checked"{{/if}} value="yes" name="options[add_paused]">' +
            '</div>' +
            '{{if plugins.Label}}<div>'  +
              '<label for="label">label:</label> <input type="text" value="" name="label">' +
            '</div>{{/if}}'  +
          '</form>'
        );

    // listen for messages from the background
    communicator.observePortMessage(function (req, sendResponse) {
      console.log('RECV CONTENT MSG', req);

      if (req.method === "add_dialog") {
        var $modal = $('#' + modalId);
        if (!$modal.length) $modal = $('<div/>', {'id': modalId, 'class': 'dsr-000'});
        $modal.html(modalTmpl.render($.extend({}, req)))
              .dialog({
                'title': 'DelugeSiphon on ' + req.domain,
                'dialogClass': 'dsr-modal',
                'appendTo': document.body,
                'minWidth': 450,
                'closeOnEscape': true,
                'buttons': [
                  {
                    'text': 'Ok',
                    'click': function () {
                      var args = $.extend({
                        method:'addlink-todeluge',
                        domain: SITE_META.DOMAIN
                      }, $(this).find('form').serializeObject());
                      communicator.sendMessage(args);
                    }
                  },
                  {
                    'text': 'Cancel',
                    'click': function () {
                      $(this).dialog('close');
                    }
                  }
                ]
              });
      }
    });
    site_init();
    console.log('PACKAGE ID: ', chrome.runtime.id);
  });
}(window, document));
