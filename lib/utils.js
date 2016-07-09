/* string, xhr and dom utils -- don't want to rely on some big framework for this extension... */

var maxDepth = 20,
    xmlHttpTimeout;

/* DOM */
function getElementsByClassName(classname, node)  {
    if(!node) node = document.getElementsByTagName("body")[0];
    var a = [];
    var re = new RegExp('\\b' + classname + '\\b');
    var els = node.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
        if(re.test(els[i].className))a.push(els[i]);
    return a;
}

function getParentElementByName(name, node, depth) {
	if(!node) return;
	if(!depth) depth = 0;
	else if (depth >= maxDepth) return;
	var parent = node.parentNode;
	if(!parent) return;
	if (name.toUpperCase() != parent.nodeName)
		parent = getParentElementByName(name, parent, ++depth);
	return parent;
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

/* EVENTS */
function stopEvent(e){
	// STOP IT STOP IT STOP IT
	if (e) {
		e.stopImmediatePropagation();
		e.stopPropagation();
		e.cancelBubble = true;
		e.preventDefault();
	}
}

/* STRINGS */
function endsWith(string, suffix) {
  if(string) return string.indexOf(suffix, string.length - suffix.length) !== -1;
}

function startsWith(string, prefix) {
  if(string) return string.indexOf(prefix) === 0;
}

function versionCompare(v1, v2, options) {
    /* thanks to TheDistantSea:
       https://gist.github.com/TheDistantSea/8021359 */
    var lexicographical = options && options.lexicographical,
        zeroExtend = options && options.zeroExtend,
        v1parts = v1.split('.'),
        v2parts = v2.split('.');

    function isValidPart(x) {
        return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    if (zeroExtend) {
        while (v1parts.length < v2parts.length) v1parts.push("0");
        while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
        v1parts = v1parts.map(Number);
        v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }

        if (v1parts[i] == v2parts[i]) {
            continue;
        }
        else if (v1parts[i] > v2parts[i]) {
            return 1;
        }
        else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}
