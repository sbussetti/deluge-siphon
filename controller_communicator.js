function listen(event_owner, event_name, callback)
{
  var event_object_field_name = "on" + event_name;
  event_owner[event_object_field_name].addListener(callback);
}

var communicator = {
  _alreadyConnectedToContentScript: false,
  _observers: [],

  connectToContentScript: function()
  {
    if (this._alreadyConnectedToContentScript) return;

    var observers = this._observers;
    function contentScriptMessageProcessor(port)
    {
      //listen(port_from_connect_script, "Message", 
	  console.assert(port.name == 'delugesiphon');
	  port.onMessage.addListener(function(msg) {
        for (var order_num in observers) observers[order_num](port,msg);
      });
    }

    //listen(chrome.extension, "Connect", contentScriptMessageProcessor);
	chrome.extension.onConnect.addListener(contentScriptMessageProcessor);
    this._alreadyConnectedToContentScript = true;
  },

  observe: function(callback)
  {
    this._observers.push(callback);
  }
};
