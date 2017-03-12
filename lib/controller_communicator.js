var communicator = {
  _Connected: false,
  _connect_observers: [],
  _disconnect_observers: [],
  _message_observers: [],
  _isTab: false,
  _port: null,
  _tab_ports: {},
  init: function ( _isTab ) {
    if ( !!this._Connected ) return this;
    this._Connected = true;
    this._isTab = !!_isTab;


    chrome.runtime.onMessage.addListener( this.onGlobalMessage.bind( this ) );

    if ( !this._isTab ) {

      chrome.runtime.onConnect.addListener( function ( port ) {

        this._tab_ports[ this.getSenderID( port.sender ) ] = port;
        port.onMessage.addListener( this.onPortMessage.bind( this ) );
        this.onConnect( port );

      }.bind( this ) );

    } else {

      this._port = chrome.runtime.connect( { name: 'delugesiphon' } );
      this._port.onMessage.addListener( this.onPortMessage.bind( this ) );
      this.onConnect( this._port );
    }

    return this;
  },

  getSenderID: function ( sender ) {
    var id = 'port';
    if ( !!sender ) {
      if ( !!sender.tab )
        id = id + '-' + sender.tab.id;
      if ( !!sender.frameId )
        id = id + '-' + sender.frameId;
    }
    return id;
  },

  onConnect: function ( port ) {

    port.onDisconnect.addListener( this.onDisconnect.bind( this ) );

    for ( var order_num in this._connect_observers )
      this._connect_observers[ order_num ]( port );

  },

  onDisconnect: function () {

    this._Connected = false;

    for ( var order_num in this._disconnect_observers )
      this._disconnect_observers[ order_num ]();

  },

  onGlobalMessage: function ( message, sender, sendResponse ) {

    // console.log( 'SVR: RECV MSG', this._isTab, message, sender );
    for ( var order_num in this._message_observers )
      this._message_observers[ order_num ]( message, sender, sendResponse );

  },

  onPortMessage: function ( req, port ) {
    // if this is a tab instance, and the message isn't being
    // sent to a tab, just immediately bail.
    // elswise, if this is the controller and the message is
    // being sent to a tab, we don't wanna listen to our own
    // messages...
    // console.log( 'PORT: RECV MSG', this._isTab, req, port );
    if ( ( this._isTab && !req._isTab || !this._isTab && req._isTab ) ) {
      // console.log( 'msg mismatch', req );
      return;
    }

    port = port || this._port;

    for ( var o in this._message_observers ) {
      this._message_observers[ o ]( req._data, function sendResponse ( resp ) {
        port.postMessage( { '_id': req._id, '_data': resp } );
      }.bind( this ) );
    }
  },

  observeMessage: function ( observer ) {

    this._message_observers.push( observer );

    return this;
  },

  observeConnect: function ( observer ) {
    this._connect_observers.push( observer );
    return this;
  },

  observeDisconnect: function ( observer ) {
    this._disconnect_observers.push( observer );
    return this;
  },

  sendMessage: function ( message, onSuccess, onError, id ) {
    // console.log( 'SEND MESSAGE', message, id, this._isTab, this._Connected, this._port );
    // only controller can send by id (won't work anyway..)
    if ( (!!id && this._isTab) || ! this._Connected ) {
      return;
    }

    try {
      var msgid = uuid4(),
        port = !id ? this._port : this._tab_ports[ id ];

      if ( !!onSuccess ) {
        port.onMessage.addListener( function ( msg ) {
          // console.log('RECV PORT MSG CALLBACK', msg);
          if ( msg._id !== msgid ) return;
          onSuccess( msg._data );
          port.onMessage.removeListener( this );
        } );
      }

      var msg = { '_id': msgid, '_isTab': !!id, '_data': message };
      port.postMessage( msg );
    } catch ( exc ) {
      // probably the background page went away -- chrome prevents reconnects.
      console.log( 'Lost connection:', exc );
      if ( !!onError ) onError( exc );
    }
    return this;
  }
};
