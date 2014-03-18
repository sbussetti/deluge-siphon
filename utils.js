var xmlHttpTimeout;
function ajax(method, url, params, callback, content_type, asynchronous){
	var http = new XMLHttpRequest();
	method = method || 'GET';
	callback = typeof callback == 'function' ? callback : function(){};
	content_type = content_type || 'text/plain';
	params = params || null;
	asynchronous = asynchronous == null ? true : asynchronous;
	http.open(method,url,asynchronous);
	http.setRequestHeader("Content-type", content_type);
	http.onreadystatechange = function(){ callback(http); };
	http.send(params);
	xmlHttpTimeout=setTimeout(function(){
		if (http.readyState) //still going..
			http.abort();
	},5000);
}

/* dom utils -- don't want to rely on some big framework for this extension... */

function getElementsByClassName(classname, node)  {
    if(!node) node = document.getElementsByTagName("body")[0];
    var a = [];
    var re = new RegExp('\\b' + classname + '\\b');
    var els = node.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
        if(re.test(els[i].className))a.push(els[i]);
    return a;
}

var maxDepth = 20;
function getParentElementByName(name, node, depth) {
	if(!node) return;
	if(!depth) depth = 0;
	else if (depth >= maxDepth) return;
	var parent = node.parentNode;
	if(!parent) return;
	if (name.toUpperCase() != parent.nodeName)
		parent = getParentElementByName(name, parent, ++depth);
	return parent
}

function getChildElementByName(name, node, depth) {
  if(!node) return;
	if(!depth) depth = 0;
	else if (depth >= maxDepth) return;
	for (var i=0, l=node.childNodes.length; i<l; i++) {
		var child = node.childNodes[i];
		if (name.toUpperCase() != child.nodeName)
			child = getChildElementByName(name, child, ++depth);
		return child;
	}
}

function getAttr(ele, attr) {
	// prefer the on-object attributes which are nicer, but fail-back to the raw attribute
	if (ele) return (ele[attr] ? ele[attr] : ele.getAttribute(attr)); 
}

function stopEvent(e){
	// STOP IT STOP IT STOP IT
	if (e) {
		e.stopImmediatePropagation(); 
		e.stopPropagation();
		e.cancelBubble = true;
		e.preventDefault();
	}
}

function endsWith(string, suffix) { if(string) return string.indexOf(suffix, string.length - suffix.length) !== -1; }

function startsWith(string, prefix) { if(string) return string.indexOf(prefix) == 0; }