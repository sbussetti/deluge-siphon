/* UTIL */
function registerEventListener ( event_name, listener, context ) {
	context = context || document;
	// console.log("REG", listener, event_name, context);
	context.removeEventListener( event_name, listener, false );
	context.addEventListener( event_name, listener, false );
}

function uuid4 () {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function ( c ) {
		var r = Math.random() * 16 | 0,
			v = c == 'x' ? r : ( r & 0x3 | 0x8 );
		return v.toString( 16 );
	} );
}

/* EVENTS */
function stopEvent ( e ) {
	// STOP IT STOP IT STOP IT
	if ( e ) {
		e.stopImmediatePropagation();
		e.stopPropagation();
		e.cancelBubble = true;
		e.preventDefault();
	}
}

/* STRINGS */
String.prototype.hashCode = function () {
	var hash = 0, i, char;
	if ( this.length === 0 ) return hash;
	for ( i = 0, l = this.length; i < l; i++ ) {
		char = this.charCodeAt( i );
		hash = ( ( hash << 5 ) - hash ) + char;
		hash |= 0; // Convert to 32bit integer
	}
	return 'x' + Math.abs( hash );
};

String.prototype.endsWith = function ( suffix ) {
	return this.indexOf( suffix, this.length - suffix.length ) !== -1;
};

String.prototype.startsWith = function ( prefix ) {
	return this.indexOf( prefix ) === 0;
};

/* VERSION CHECK */
function versionCompare ( v1, v2, options ) {
	/* thanks to TheDistantSea:
	   https://gist.github.com/TheDistantSea/8021359 */
	var lexicographical = options && options.lexicographical,
		zeroExtend = options && options.zeroExtend,
		ignoreMinor = options && options.ignoreMinor,
		v1parts = v1.split( '.' ),
		v2parts = v2.split( '.' );

	function isValidPart ( x ) {
		return ( lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/ ).test( x );
	}

	if ( !v1parts.every( isValidPart ) || !v2parts.every( isValidPart ) ) {
		return NaN;
	}

	if ( zeroExtend ) {
		while ( v1parts.length < v2parts.length ) v1parts.push( "0" );
		while ( v2parts.length < v1parts.length ) v2parts.push( "0" );
	}

	if ( !lexicographical ) {
		v1parts = v1parts.map( Number );
		v2parts = v2parts.map( Number );
	}

	for ( var i = 0; i < v1parts.length; ++i ) {
        if (v2parts.length - 1 == i && v2parts.length > 1 && ignoreMinor) {
            return 0;
        } else if ( v2parts.length == i) {
			return 1;
		}

		if ( v1parts[ i ] == v2parts[ i ] ) {
			continue;
		} else if ( v1parts[ i ] > v2parts[ i ] ) {
			return 1;
		} else {
			return -1;
		}
	}

	if ( v1parts.length != v2parts.length ) {
		return -1;
	}

	return 0;
}

Function.prototype.curry = function () {
	var parameters = Array.prototype.slice.call( arguments, 0 ),
		uncurried = this;

	return function () {
		return uncurried.apply( this, parameters.concat(
			Array.prototype.slice.call( arguments, 0 )
		) );
	};
};
