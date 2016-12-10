/* jshint node:true */

var gulp = require( 'gulp' ),
	copy = require( 'gulp-copy' ),
	notify = require( 'gulp-notify' ),
	uglifycss = require( 'gulp-uglifycss' ),
	uglify = require( 'gulp-uglify' ),
	fs = require( 'fs' ),
	plumber = require( 'gulp-plumber' ),
    sourcemaps = require( 'gulp-sourcemaps' ),
    zip = require( 'gulp-zip' ),
	concat = require( 'gulp-concat' );


var manifest = require( './manifest.json' ),
	popupJS = [ 'lib/jquery-3.0.0.min.js', 'lib/controller_communicator.js', 'lib/utils.js', 'popup.js' ],
	optionsCSS = [ 'chrome-bootstrap.css', 'options.css' ],
	optionsJS = [ 'lib/jquery-3.0.0.min.js', 'lib/utils.js', 'options.js' ];

gulp.task( 'build-content-css', function () {

	gulp.src( manifest.content_scripts[ 0 ].css )
		.pipe( uglifycss( { uglyComments: true } ) )
		.pipe( concat( 'content.min.css' ) )
		.pipe( gulp.dest( './build/' ) )
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
		.pipe( gulp.dest( './build/' ) )
		.pipe( notify( {
			title: 'Gulp',
			message: 'Built options style',
			onLast: true
		} ) );

} );

function buildJS ( src, destFile ) {
	return function () {

		gulp.src( src )
			.pipe( plumber( {
				errorHandler: notify.onError( function ( error ) {
					return error.name + ': ' + error.message + '\n' + error.cause.filename + '[' + error.cause.line + ':' + error.cause.col + '] ' + error.cause.message;
				} )
			} ) )
            .pipe(sourcemaps.init())
			.pipe( uglify() )
			.pipe( plumber.stop() )
			.pipe( concat( destFile ) )
            .pipe(sourcemaps.write('maps'))
			.pipe( gulp.dest( './build/' ) )
			.pipe( notify( {
				title: 'Gulp',
				message: 'Built: ' + destFile,
				onLast: true
			} ) );

	};
}

gulp.task( 'build-content-js', buildJS( manifest.content_scripts[ 0 ].js, 'content.min.js' ) );

gulp.task( 'build-background-js', buildJS( manifest.background.scripts, 'background.min.js' ) );

gulp.task( 'build-popup-js', buildJS( popupJS, 'popup.min.js' ) );

gulp.task( 'build-options-js', buildJS( optionsJS, 'options.min.js' ) );

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
		.pipe( copy( './build/' ) )
		.pipe( gulp.dest( './' ) );

	fs.writeFile( './build/manifest.json', JSON.stringify( manifest ), callback );

} );

gulp.task( 'package', function ( ) {

    var buildManifest = require('./build/manifest.json');

    return gulp.src('build/**/*')
            .pipe(zip('deluge-siphon-' + buildManifest.version + '.zip'))
            .pipe(gulp.dest('dist'));
});

function watch () {

	gulp.watch( manifest.content_scripts[ 0 ].css, [ 'build-content-css' ] );
	gulp.watch( manifest.content_scripts[ 0 ].js, [ 'build-content-js' ] );
	gulp.watch( manifest.background.scripts, [ 'build-background-js' ] );
	gulp.watch( popupJS, [ 'build-popup-js' ] );
	gulp.watch( optionsJS, [ 'build-options-js' ] );
	gulp.watch( optionsCSS, [ 'build-options-css' ] );
	gulp.watch( [ '*.json', '*.html' ], [ 'copy-project-files' ] );

}

gulp.task( 'watch', watch );
gulp.task( 'build', [ 'build-content-css', 'build-content-js', 'build-background-js', 'build-popup-js', 'build-options-css', 'build-options-js', 'copy-project-files' ] );
