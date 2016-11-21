( function () {
	communicator.observeConnect(function () {
		communicator.sendMessage( {
			method: "storage-get-deluge_server_url"
		}, function ( response ) {
			var servurl = response.value;
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
