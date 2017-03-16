( function () {
  communicator.observeConnect(function () {
    communicator.sendMessage( {
      method: "storage-get-connections"
    }, function ( response ) {
      var servurl;
      try { servurl = response.value[0].url; } catch (e) {}

      if ( servurl ) {
        $( '#server-url' ).removeClass( 'hidden' );
        $( '#server-url-link' ).attr( 'href', servurl );
      } else {
        $( '#server-url' ).addClass( 'hidden' );
        $( '#server-url-link' ).attr( 'href', null );
        $( '#reminder' ).innerHTML = 'Don\'t forget to configure your server info first!';
      }
      $( 'a' ).on( 'click', function () {
        $( this ).blur();
      } );
    } );
  } ).init( 'popup' );
} )();
