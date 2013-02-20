# DelugeSiphon - Open Source Extension for Chrome
  Author: S Bussetti
  Web: http://deluge-siphon.googlecode.com/
  Released under the Apache License 2.0

## Changelist

### v 0.65 Added support for left-click handling [lawrencealan](http://github.com/lawrencealan)
  * Fixed magnet link handling 
  * Added support for regular click handling, with regular expression matching of HREF attributes

### v 0.64 Upgrade to Manifiest 2.0, AJAX link support [lawrencealan](http://github.com/lawrencealan)
  * Upgraded manifest.json and relative files to 2.0
  * Modified event listeners to use a single global "contextmenu" event listener on the window, so that sites that use AJAX updating to insert new links will work without having to re-scan the DOM for new anchor elements. This is also less work for the browser (versus scanning anchor elements) -- any contextmenu events will bubble up to this listener without having multiples. 

### v 0.63.6 Magnet Support
  * Issue 7: Now supporting sending remote magnet links to your deluge server.

### v 0.63.5 Bugfix
  * Issue 4: Cleaned up background getsession process, removed some related hacks/debug code.
  * Issue 5: manifest.json was missing permissions to make XHR requests over https and ftp, despite allowing content scripts to access links of the same protocol.

### v 0.63.4 Bugfix
  * Fixed a small bug related to connection polling.

### v 0.63.3 Bugfix
  * Added support for all private trackers that do not include authentication tokens in their torrent urls, or require cookies to download torrent files. Should make this compatible with many many more trackers.
  * Added a link to log into your web-ui from extension tooltip.

### v 0.63.2 Bugfix
  * Spelling error in options page.
  * Major refactor including:
    * Ditched old in-page notifications in favor of standard Chrome notifications which are compatible with context menu actions.
    * Context menu update to resolve issue where right-click menu fails.

### v 0.63 & 0.63.1 Bugfix
  * Sorry about all the context menu bugs.  Fixed the "no context menu" and "too many context menu" entries bugs, now you get the right amount all the time.

### v 0.62 Encontextening
  * Added context menu item.
  * Added Options item "Enable Control + Rightclick Macro".  Old macro disabled by default.
  * Unbroke saving options (sorry about that).

### v 0.61 Bugfix
  * More consistent styles for inpage notifications
  * Better direction of user to options page.

### v. 0.6 Bugfix
  * Improved options page: automatic save, some url cleanup.
  * Now automatically reconnects your webui to your deluge daemon.  Will not attempt to start an offline daemon.
  * Password no longer a required field.		
	
### v. 0.5 Initial Release
