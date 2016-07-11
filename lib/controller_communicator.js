var communicator = {
  _alreadyConnected: false,
  _message_observers: [],
  _connect_observers: [],
  _port_message_observers: [],
  _port: null,
  _isTab: false,
  _tab_ports: {},
  init: function(isTab, finished) {
    if (!!this._alreadyConnected) return;
    this._alreadyConnected = true;
    this._isTab = !!isTab;

    /* dedicated port */
    if (!isTab) { // no tab id, expect to be the background page
      chrome.runtime.onConnect.addListener(function(port) {
        // console.log(port);

        for (var order_num in this._connect_observers)
          this._connect_observers[order_num](port);

        // console.log('RECV CONN', id);
        this._tab_ports[this.getSenderID(port.sender)] = port;
        this.registerPortMessageObservers(port);
        this.registerMessageObservers();

        if (!!finished) finished();
      }.bind(this));
    } else {
      this._port = chrome.runtime.connect({name: 'delugesiphon'});
      this.registerPortMessageObservers(this._port);
      this.registerMessageObservers();

      if (!!finished) finished();
    }
  },
  getSenderID: function (sender) {
    var id = 'port';
    if (!!sender) {
      if (!!sender.tab) id = id + '-' + sender.tab.id;
      if (!!sender.frameId) id = id + '-' + sender.frameId;
    }
    return id;
  },
  registerMessageObservers: function () {
    /* one-time messages */
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse){
      // console.log('RECV MSG', message, sender);
      for (var order_num in this._message_observers)
        this._message_observers[order_num](message, sender, sendResponse);
    }.bind(this));
  },
  registerPortMessageObservers: function(port){
    port.onMessage.addListener(function (req) {
      // if this is a tab instance, and the message isn't being
      // sent to a tab, just immediately bail.
      // elswise, if this is the controller and the message is
      // being sent to a tab, we don't wanna listen to our own
      // messages...
      if ((this._isTab && !req._isTab || !this._isTab && req._isTab)) return;
      var id = req._id,
          message = req._data;
      for (var o in this._port_message_observers) {
        this._port_message_observers[o](message, function (resp) {
          port.postMessage({'_id': id, '_data': resp});
        }.bind(this));
      }
    }.bind(this));
  },
  observeMessage: function(observer){
    this._message_observers.push(observer);
  },
  observeConnect: function(observer){
    this._connect_observers.push(observer);
  },
  observePortMessage: function(observer){
    this._port_message_observers.push(observer);
  },
  sendMessage: function(message, success, error, id) {
    // only controller can send by id (won't work anyway..)
    console.assert(!id || !this.isTab);
    var msgid = uuid4();
    try {
      // TODO: technically I think if this is the controller
      // sending to an ID, but we lost connection,
      // it can reconnect to the client script  so it can
      // start sending again  to its port?..
      var port = !id ? this._port : this._tab_ports[id];
      if (!!success) {
        port.onMessage.addListener(function (msg) {
          // console.log('RECV PORT MSG CALLBACK', msg);
          if (msg._id !== msgid) return;
          success(msg._data);
          port.onMessage.removeListener(this);
        });
      }

      var msg = {'_id': msgid, '_isTab': !!id, '_data': message};
      // console.log('SEND PORT MSG', msg, port);
      port.postMessage(msg);
    } catch (exc) {
      // try to reconnect...
      console.log(exc);
      if (!!error) error(exc);
    }
  }
};
