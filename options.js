(function() {
  // manages options
  var options = {
    CONNECTION_DEFAULTS: [
      {
        id: 'url',
        def: '',
        opts: {
          validate: function(string) {
            if (!string)
              return string;

            var regexp = /^(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
            return regexp.test(string) && !string.match(/\/$/);
          },
          validate_message: 'Invalid server url.',
          required: true,
          scrubber: function(string) {
            //no trailing / on url makes construction simpler..
            if (!string)
            return '';

            if (string.substring(0, 4) != 'http')
              string = 'http://' + string;

            li = string.length - 1;
            if (string.charAt(li) == '/')
              string = string.substring(0, string.length - 1);

            return string;
          }
        },
      },
      {
        id: 'pass',
        def: "",
        opts: {}
      }
    ],

    DEFAULTS: [
      {
        id: 'inpage_notification',
        def: true,
        opts: {}
      },
      {
        id: 'enable_context_menu',
        def: true,
        opts: {}
      },
      {
        id: 'enable_context_menu_with_options',
        def: true,
        opts: {}
      },
      {
        id: 'enable_keyboard_macro',
        def: true,
        opts: {}
      },
      {
        id: 'enable_leftclick',
        def: true,
        opts: {}
      },
      {
        id: 'default_label',
        def: '',
        opts: {}
      },
      {
        id: 'link_regex',
        def: '',
        opts: {}
      },
      {
        id: 'enable_debug_logging',
        def: false,
        opts: {}
      },
    ],

    validate_element: function validate_element(opts, element) {
      var o = opts.id,
        val = '';
      res = {
        err: false,
        mu: null
      };

      if (!element.length) {
        return res
      } else if (element.is('input[type=checkbox]')) {
        if (element.prop('checked')) {
          val = element.val();
        }
      } else if (element.is('input[type=text]') || element.is('input[type=password]')) {
        val = element.val();
      } else if (element.is('select')) {
        val = element.val();
      } else {
        throw 'unknown element';
      }

      var errorNotice = $('<span/>', { 'class': 'validation-message' }),
        validate = opts.opts.validate,
        validate_message = opts.opts.validate_message,
        required = opts.opts.required,
        scrubber = opts.opts.scrubber;

      errorNotice.css('color', 'red');

      //apply helpers
      if (scrubber) {
        val = scrubber(val);
      }

      //validate
      if (required && (typeof val === 'undefined' || val === null || val === '')) {
        errorNotice.html('Required field.');
        element.after(errorNotice);
        res.err = true;
      } else if (validate && !validate(val)) {
        errorNotice.html(validate_message || 'Invalid entry.');
        element.after(errorNotice);
        res.err = true;
      } else {
        res.mu = {
          opt_id: o,
          opt_val: val,
        };
      }

      return res;
    },

    save: function save_options() {
      $('.validation-message').empty();
      $('#save_options').text('Saving...');

      var validation_error = false,
        mutator = [];

      //connections
      var connection_mutator = [];
      $('#connection-info .connection-container').each(function() {
        var $this = $(this),
          index = $this.data('index'),
          cm = {},
          ce = false;
        for (var i = 0, l = options.CONNECTION_DEFAULTS.length; i < l; i++) {
          var o = options.CONNECTION_DEFAULTS[i].id,
            element = $this.find('[name="' + o + '"]'),
            res = options.validate_element(options.CONNECTION_DEFAULTS[i], element);

          if (validation_error || ce || res.err) {
            validation_error = true;
          } else if (res.mu) { // only push if no errors at all for conns..
              cm[res.mu.opt_id] = res.mu.opt_val;
          }
        }
        if (!ce) {
          connection_mutator.push(cm);
        }
      });
      if (connection_mutator.length) {
        mutator.push({
          opt_id: 'connections',
          opt_val: JSON.stringify(connection_mutator)
        });
      }

      for (var ii = 0, ll = options.DEFAULTS.length; ii < ll; ii++) {
        var o = options.DEFAULTS[ii].id,
          element = $('#' + o),
          res = options.validate_element(options.DEFAULTS[ii], element);

        if (res.err) {
          validation_error = true;
        } else if (res.mu) {
          mutator.push(res.mu);
        }

      }

      if (!validation_error) {
        // if validation passed, then apply the mutator (save)
        for (var iii = 0, lll = mutator.length; iii < lll; iii++) {
          var m = mutator[iii];
          localStorage.setItem(m.opt_id, m.opt_val);
        }
      }

      $('#save_options').text('Save');
      // BROADCAST SETTINGS CHANGE
      chrome.runtime.sendMessage(chrome.runtime.id, {
        method: 'settings-changed'
      });
    },

    // Restores state to saved value from localStorage.
    restore: function restore_options() {
      // labels
      //check for label plugin status
      communicator.sendMessage({
        method: "plugins-getinfo"
      }, function (response) {
        var labels = response.value.Label;

        var labelsTempl = $.templates($('#labels-options-tmpl').html()),
          $labelsContainer = $('#labels-options').empty(),
          d = {
            labelsEnabled: !!labels,
            labelsCreated: !!labels && !!labels.length,
            labels: labels
          };
        $labelsContainer.append(labelsTempl(d));

        //connections
        var connections = [{}];
        try {
          connections = JSON.parse(localStorage.connections);
        } catch (e) {};
        connections = $.isArray(connections) ? connections : [{}];
        // template for multiple connections
        var connectionTempl = $.templates($('#connection-string-tmpl').html()),
          $connContainer = $('#connection-info').empty();
        connections.forEach(function(c, i) {
          var d = {
            index: i
          };
          for (var i = 0, l = options.CONNECTION_DEFAULTS.length; i < l; i++) {
            var o = options.CONNECTION_DEFAULTS[i].id,
              val = typeof c[o] === 'undefined' || c[0] === null ? options.CONNECTION_DEFAULTS[i].def : c[o];
            d[o] = val;
          }
          $connContainer.append(connectionTempl(d));
        });

        // "normal" settings
        for (var i = 0, l = options.DEFAULTS.length; i < l; i++) {
          var o = options.DEFAULTS[i].id,
            val = localStorage.getItem(o) === null ? options.DEFAULTS[i].def : localStorage.getItem(o),
            element = $('#' + o);

          if (typeof val == 'undefined' || !element.length) {
            continue;
          }
          if (element.is('input[type=checkbox]')) {
            element.prop('checked', !!val);
          } else if (element.is('input[type=text]') || element.is('input[type=password]')) {
            element.val(val);
          } else if (element.is('select')) {
            element.val(val);
          } else {
            console.error(element, o);
            throw 'unknown element';
          }
        }

        options.save();
      });
    },

    clear: function clear_options() {
      localStorage.clear();
      options.restore();
      // BROADCAST SETTINGS CHANGE
      communicator.sendMessage({
        method: 'settings-changed'
      });
    }
  };

  /* INIT */
  // fix old format: deluge_server_url, server_pass
  if ('deluge_server_url' in localStorage) {
    if ((localStorage.deluge_server_url || localStorage.server_pass) && ( !localStorage.connections || !localStorage.connections.length) ) {
      localStorage.connections = JSON.stringify([{
        'url': localStorage.deluge_server_url,
        'pass': localStorage.server_pass
      }]);
      delete localStorage.deluge_server_url;
      delete localStorage.server_pass;
    }
  }

  communicator
    .observeConnect( function () {

      options.restore();
      //display current version
      $('#version').html(chrome.runtime.getManifest().version);

      /* EVENT LISTENERS */
      $(document)
        .on('change', 'input.option_field[type=checkbox]', options.save)
        .on('blur', 'input.option_field:not([type=checkbox])', options.save)
        .on('change', 'select.option_field', options.save);

      //special handler for combo regex field
      $('#enable_leftclick')[0].addEventListener('change', function(e) {
        $('#link_regex').prop('disabled', !this.checked);
      }, false);
      $('#link_regex').prop('disabled', !$('#enable_leftclick').prop('checked'));

      //reset to defaults button
      $('#reset_options').on('click', options.clear);

      //save button
      $('#save_options').on('click', options.save);

      //link to self on manage extensions page
      $('#manage_extension')[0].addEventListener('click', function(e) {
        chrome.tabs.create({
          url: 'chrome://chrome/extensions/?id=' + chrome.runtime.id
        });
      });


    })
    .init( !!chrome.runtime.id );

})(document);
