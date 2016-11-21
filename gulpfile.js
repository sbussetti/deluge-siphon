/* jshint node:true */

var gulp = require( 'gulp' ),
	copy = require( 'gulp-copy' ),
	notify = require( 'gulp-notify' ),
	uglifycss = require( 'gulp-uglifycss' ),
	uglify = require( 'gulp-uglify' ),
    fs = require('fs'),
	concat = require( 'gulp-concat' );


var manifest = require( './manifest.json' ),
	popupJS = [ 'lib/jquery-3.0.0.min.js', 'lib/controller_communicator.js', 'lib/utils.js', 'popup.js' ],
	optionsCSS = [ 'chrome-bootstrap.css', 'options.css' ],
	optionsJS = [ 'lib/jquery-3.0.0.min.js', 'lib/utils.js', 'options.js' ];

gulp.task( 'build-content-css', function () {

	gulp.src( manifest.content_scripts[ 0 ].css )
		.pipe( uglifycss( { uglyComments: true } ) )
		.pipe( concat( 'content.min.css' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built style',
			onLast: true
		} ) );

} );

gulp.task( 'build-options-css', function () {

	gulp.src( optionsCSS )
		.pipe( uglifycss( { uglyComments: true } ) )
		.pipe( concat( 'options.min.css' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built options style',
			onLast: true
		} ) );

} );

gulp.task( 'build-content-js', function () {

	gulp.src( manifest.content_scripts[ 0 ].js )
		.pipe( uglify() )
		.pipe( concat( 'content.min.js' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built js',
			onLast: true
		} ) );

} );

gulp.task( 'build-background-js', function () {

	gulp.src( manifest.background.scripts )
		.pipe( uglify() )
		.pipe( concat( 'background.min.js' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built background js',
			onLast: true
		} ) );

} );

gulp.task( 'build-popup-js', function () {

	gulp.src( popupJS )
		.pipe( uglify() )
		.pipe( concat( 'popup.min.js' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built popup js',
			onLast: true
		} ) );

} );

gulp.task( 'build-options-js', function () {

	gulp.src( optionsJS )
		.pipe( uglify() )
		.pipe( concat( 'options.min.js' ) )
		.pipe( gulp.dest( './dist/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built options js',
			onLast: true
		} ) );

} );


gulp.task( 'copy-project-files', function ( callback ) {
	manifest.content_scripts[ 0 ].css = [ 'content.min.css' ];
	manifest.content_scripts[ 0 ].js = [ 'content.min.js' ];
	manifest.background.scripts = [ 'background.min.js' ];

	gulp.src( [
        'README.md',
		'./images/*',
		'options.html',
		'popup.html'
	] )
		.pipe( copy( './dist/' ) )
		.pipe( gulp.dest( './' ) );

	fs.writeFile( './dist/manifest.json', JSON.stringify( manifest ), callback );

} );

function watch () {

	gulp.watch( manifest.content_scripts[ 0 ].css, [ 'build-content-css' ] );
	gulp.watch( manifest.content_scripts[ 0 ].js, [ 'build-content-js' ] );
	gulp.watch( manifest.background.scripts, [ 'build-background-js' ] );
	gulp.watch( popupJS, [ 'build-popup-js' ] );
	gulp.watch( optionsJS, [ 'build-options-js' ] );
	gulp.watch( optionsCSS, [ 'build-options-css' ] );

}

gulp.task( 'watch', watch );
gulp.task( 'build', [ 'build-content-css', 'build-content-js', 'build-background-js', 'build-popup-js', 'build-options-css', 'build-options-js', 'copy-project-files' ] );
