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
      listeners = {};
  
  function extract_torrent_url(e, site_meta){
    var element,
        torrent_match,
        torrent_url,
        attr = site_meta.TORRENT_URL_ATTRIBUTE,
        regex = new RegExp(site_meta.TORRENT_REGEX);

    if (getAttr(e.target, attr)) element = e.target;
    if (!getAttr(element, attr)) element = getChildElementByName('a', e.target);
    if (!getAttr(element, attr)) element = getParentElementByName('a', e.target);
    var val = getAttr(element, attr);
    if (val) torrent_match = val.match(regex);
    
    if (torrent_match) {
      //TODO: can't this just also go into site meta as a matching callback..
      //then all the site specific logic ends up in the same place..
      if (endsWith(site_meta.DOMAIN, 'tvtorrents.com')) {
        /* 
          this block is specifically for tvtorrents' weird-ass forms and onclick handlers
          Detail page:
          <input type="button" value=" GET TORRENT " class="miscbutton2" onclick="loadTorrent('40fe0129dac94a1efabff934a2e74e322d581270')">
          <input type="button" value=" GET TORRENT (HTTPS)" class="miscbutton2" onclick="loadTorrentHTTPS('40fe0129dac94a1efabff934a2e74e322d581270')">
          List page:
          <a href="#" onclick="return loadTorrent('40fe0129dac94a1efabff934a2e74e322d581270')"><img/></a>
        */        
        var info_hash = torrent_match[2];
        var is_https = torrent_match[1] ? true : false;
        // we could also  try and extract  this from the src, but I'm currently naively assuming these urls
        // won't change... realistically any kind of serious site change will break  this since TVT is so specific..
        if (is_https)  {
          torrent_url = 'https://www.tvtorrents.com/FetchTorrentServlet?info_hash=' + info_hash + '&digest=' + site_meta.digest + '&hash=' + site_meta.hash;
        }  else {
          torrent_url = 'http://torrent.tvtorrents.com/FetchTorrentServlet?info_hash=' + info_hash + '&digest=' + site_meta.digest + '&hash=' + site_meta.hash;
        }
      } else {
        // for vanilla sites just return the whole matching string...
        torrent_url = torrent_match.input;
      }
    }
    return torrent_url;
  }  
  
  function process_event(e){
    //process the event and if possible, sends the extracted link to the controller
    var torrent_url = extract_torrent_url(e, SITE_META);
    if  (torrent_url) {
      stopEvent(e);
      //console.log('addlink', torrent_url, SITE_META.DOMAIN);
      chrome.runtime.sendMessage(chrome.runtime.id, {
        method:'addlink-todeluge', url:torrent_url, domain: SITE_META.DOMAIN
      });
    }  
  }
  
  function handle_keydown(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = true;
  }
  
  function handle_keyup(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = false;
  }
  
  function handle_rightclick_for_macro(e) {
    // handles the original control + rightclick macro
    if (CONTROL_KEY_DEPRESSED) process_event(e);
  }
  
  function handle_rightclick_for_contextmenu(e) {
      // some sites, like TVT, add links via javascript and other complex methods.
      // chrome's contextmenu API however, does not provide access to the dom, therefore
      // we need to capture what we need from here and kick it to the backend where the 
      // contextmenu function can retrieve it out of localstorage...
      
      var torrent_url = extract_torrent_url(e, SITE_META);
      if  (torrent_url) {
        chrome.runtme.sendMessage(chrome.runtime.id, {
          method: "storage-set-site_current_url_" + SITE_META.DOMAIN, value: torrent_url
        });
      }
  }

  function handle_leftclick(e) {
    process_event(e);
  }
  
  function handle_visibilityChange() {
    if (! document.webkitHidden && document.webkitVisibilityState != 'prerender') {
      site_init();
      // check if settings have changed and adjust handlers accordingly
      install_configurable_handlers();
    }
  }

  /* BEGIN site specific stuff */

  // and then we also need to actually rewrite the inline onclick attributes to prevent the function from firing =/
  // and we actually have to check every anchor and every input b/c TVT has no selectors on  it.
  function TVTblockLoadTorrent() {
    var nodenames = ['INPUT', 'A'];
    for (var nodei in nodenames) {
      var elements = document.body.getElementsByTagName(nodenames[nodei]);
      for (var i = 0, l = elements.length; i < l; i++) {
        var element = elements[i];
        // we explicitly want the txt in  this case.. not a vivified function..
        var onclick_txt = element.getAttribute('onclick');
        if (startsWith(onclick_txt, 'return loadTorrent') || startsWith(onclick_txt, 'loadTorrent')) {
          // neuter any inline onclicks b/c they cannot be stopped.  Just patching the object won't do it
          // must recreate a clean copy of the element and replace it...
          // TODO: going this route we could extract the hash at this point and remove the call to loadTorrent altogether...
          var new_element;
          if (element.nodeName == 'INPUT') {
            new_element = document.createElement('input');
            new_element.setAttribute('type', 'button');
            new_element.setAttribute('value', element.getAttribute('value'));
            new_element.setAttribute('class', element.getAttribute('class'));
            new_element.setAttribute('onclick', 'return false; ' + onclick_txt);
            element.parentNode.replaceChild(new_element, element);
          } else if (element.nodeName == 'A')  {
            new_element = document.createElement('a');
            new_element.setAttribute('href', element.getAttribute('href'));
            new_element.setAttribute('class', element.getAttribute('class'));
            new_element.setAttribute('onclick', 'return false; ' + onclick_txt);
            new_element.appendChild(element.firstChild);
            element.parentNode.replaceChild(new_element, element);            
          }
        }
      }
    }
  }

  /* END site specific stuff */
  
  function install_configurable_handlers(){
    /*
      so, this provides a rudimentary event
      handler registry.  Following this pattern
      lets us turn the event handlers on and off on the
      fly based on a users settings.  Without it they'd
      have to refresh any open tabs after a config change.

      TODO: functionalize setup and teardown of listeners;
      this isn't DRY..
    */
    
    /* install control + rightclick keyboard macro */
    chrome.runtime.sendMessage(chrome.runtime.id, {
      method: "storage-get-enable_keyboard_macro"
    }, {}, function(response) {
      if ( response.value ) {
        // if "control + right click" macro enabled
        if (! listeners.keydown) {
          listeners.keydown = handle_keydown;
          document.addEventListener('keydown', handle_keydown,false);
        }

        if (! listeners.keyup) {
          listeners.keyup = handle_keyup;
          document.addEventListener('keyup', handle_keyup,false);
        }
        
        // contextmenu event is just generic rightclick..
        if (! listeners.contextmenu)  {
          document.addEventListener('contextmenu', handle_rightclick_for_macro, false);
          listeners.contextmenu = handle_rightclick_for_macro;
        }

        if (endsWith(SITE_META.DOMAIN, 'tvtorrents.com')) {
          /* install this helper */
          if (! listeners.contextmenu_helper) {
            document.addEventListener('contextmenu', handle_rightclick_for_contextmenu, false);
            listeners.contextmenu_helper = handle_rightclick_for_contextmenu;
          }
        }
      } else {
        // it may have been turned off in settings, so remove if it exists.
        if (listeners.keydown) {
          document.removeEventListener('keydown', listeners.keydown);
          listeners.keydown = null;
        }
        
        if (listeners.keyup) {
          document.removeEventListener('keyup', listeners.keyup);
          listeners.keyup = null;
        }

        if (listeners.contextmenu) {
          document.removeEventListener('contextmenu', listeners.contextmenu);
          listeners.contextmenu = null;
        }

        if (listeners.contextmenu_helper) {
          document.removeEventListener('contextmenu', listeners.contextmenu_helper);
          listeners.contextmenu_helper = null;
        }
      }
    });

    /* install leftclick handling */
    chrome.runtime.sendMessage(chrome.runtime.id, {
      method: "storage-get-enable_leftclick"
    }, {}, function(response) {
      if (response.value) {
        if (! listeners.click) {
          document.body.addEventListener('click', handle_leftclick, false);
          listeners.click = handle_leftclick;
        }
        if (endsWith(SITE_META.DOMAIN, 'tvtorrents.com')) {
          /* hacky mchackerson but TVT is not like the others... */
          if (! listeners.mutation){
            TVTblockLoadTorrent();
            var observer = new WebKitMutationObserver(TVTblockLoadTorrent, false);
            observer.observe(document, { childList: true, subtree: true });
            listeners.mutation = observer;
          }
        }
      } else {
        if (listeners.click) {
          // it has been turned off in settings, so remove if it exists.      
          document.body.removeEventListener('click', listeners.click);
          listeners.click = null;
        }
        if (listeners.mutation){
          // TODO: we can turn off our mutation listener, but we still need to remove all
          // the "return false's; we had to force into the onclick handlers to resume 
          // normal functionality.
          // TVTunblockLoadTorrent();
          listeners.mutation.disconnect();
          listeners.mutation = null;
        }
      }
    });
  }
  
  function site_init(){
    /*
      This function identifies the site and sets up things like the regex
      needed to parse for torrent hrefs, or other more site-specific requirements
      such as tvtorrent's additional hash and digest info.
    */
    //WHERE AM I?! 
    
    if (endsWith(SITE_META.DOMAIN, 'tvtorrents.com')) {
      SITE_META.TORRENT_REGEX = 'loadTorrent(HTTPS)?\\([\'"]([^\'"]+)[\'"]\\)';
      SITE_META.TORRENT_URL_ATTRIBUTE = 'onclick';
      /* as far as I can tell  this is pretty much honestly the best way to figure this out. we need these additional pieces of info
         TODO: pretty sure i need to send this data back into storage so that the context-menu based add routines can also access
         the hash and the digest  since context menus don't actually get access to the page... */
      var scripts = document.head.getElementsByTagName('script'),
          hash_regex = /\bhash=['"]([^'"]+)['"];/;
          digest_regex = /\bdigest=['"]([^'"]+)['"];/;
      for (var i = 0, l = scripts.length; i < l; i++) {
        var script = scripts[i];
        //we're looking for an inpage script
        if (! script.src) {
          var src = script.textContent;
          // so the idea is, find the general area where function loadTorrent appears.. extract it as a substring
          // and then do a regex match, instead of trying to match on the whole script.
          var func_start = src.indexOf('function loadTorrent( infoHash ) {');
          if (func_start !== -1) {
            //350 is about how long the whole function is  unless they really substantially change it
            //and the data we need is at the top anyway..
            var func_text = src.substr(func_start, func_start + 350);
            var hash_match = func_text.match(hash_regex);
            var digest_match = func_text.match(digest_regex);
            var hash = hash_match ? hash_match[1] : null;
            var digest = digest_match ? digest_match[1] : null;
            if (hash && digest) {
              SITE_META.hash = hash;
              SITE_META.digest = digest;
            } else {
              console.log("Failed to parse hash/digest from page.  Programmer error =(");
            }
          }
        }
      }
    } else {
      // all  other sites besides TVT get the standard regex you set..
      /* get regex for link checking from settings */ 
      chrome.runtime.sendMessage(chrome.runtime.id, {
        method: 'storage-get-link_regex'
      }, {}, function(response){
        SITE_META.TORRENT_REGEX = response.value;
      });    
    }    
  } /* end site_init */
  
  // initialize once, then
  handle_visibilityChange();
  // watch for tab changes
  if (! listeners.webkitvisibilitychange) {
    document.addEventListener('webkitvisibilitychange', handle_visibilityChange, false);
    listeners.webkitvisibilitychange = handle_visibilityChange;  
  }

  SITE_META.INSTALLED = true;
}(window, document));
