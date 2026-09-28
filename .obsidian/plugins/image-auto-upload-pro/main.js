'use strict';

var obsidian = require('obsidian');
var node_buffer = require('node:buffer');

var pathBrowserify;
var hasRequiredPathBrowserify;

function requirePathBrowserify () {
	if (hasRequiredPathBrowserify) return pathBrowserify;
	hasRequiredPathBrowserify = 1;

	function assertPath(path) {
	  if (typeof path !== 'string') {
	    throw new TypeError('Path must be a string. Received ' + JSON.stringify(path));
	  }
	}

	// Resolves . and .. elements in a path with directory names
	function normalizeStringPosix(path, allowAboveRoot) {
	  var res = '';
	  var lastSegmentLength = 0;
	  var lastSlash = -1;
	  var dots = 0;
	  var code;
	  for (var i = 0; i <= path.length; ++i) {
	    if (i < path.length)
	      code = path.charCodeAt(i);
	    else if (code === 47 /*/*/)
	      break;
	    else
	      code = 47 /*/*/;
	    if (code === 47 /*/*/) {
	      if (lastSlash === i - 1 || dots === 1) ; else if (lastSlash !== i - 1 && dots === 2) {
	        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ || res.charCodeAt(res.length - 2) !== 46 /*.*/) {
	          if (res.length > 2) {
	            var lastSlashIndex = res.lastIndexOf('/');
	            if (lastSlashIndex !== res.length - 1) {
	              if (lastSlashIndex === -1) {
	                res = '';
	                lastSegmentLength = 0;
	              } else {
	                res = res.slice(0, lastSlashIndex);
	                lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
	              }
	              lastSlash = i;
	              dots = 0;
	              continue;
	            }
	          } else if (res.length === 2 || res.length === 1) {
	            res = '';
	            lastSegmentLength = 0;
	            lastSlash = i;
	            dots = 0;
	            continue;
	          }
	        }
	        if (allowAboveRoot) {
	          if (res.length > 0)
	            res += '/..';
	          else
	            res = '..';
	          lastSegmentLength = 2;
	        }
	      } else {
	        if (res.length > 0)
	          res += '/' + path.slice(lastSlash + 1, i);
	        else
	          res = path.slice(lastSlash + 1, i);
	        lastSegmentLength = i - lastSlash - 1;
	      }
	      lastSlash = i;
	      dots = 0;
	    } else if (code === 46 /*.*/ && dots !== -1) {
	      ++dots;
	    } else {
	      dots = -1;
	    }
	  }
	  return res;
	}

	function _format(sep, pathObject) {
	  var dir = pathObject.dir || pathObject.root;
	  var base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');
	  if (!dir) {
	    return base;
	  }
	  if (dir === pathObject.root) {
	    return dir + base;
	  }
	  return dir + sep + base;
	}

	var posix = {
	  // path.resolve([from ...], to)
	  resolve: function resolve() {
	    var resolvedPath = '';
	    var resolvedAbsolute = false;
	    var cwd;

	    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
	      var path;
	      if (i >= 0)
	        path = arguments[i];
	      else {
	        if (cwd === undefined)
	          cwd = process.cwd();
	        path = cwd;
	      }

	      assertPath(path);

	      // Skip empty entries
	      if (path.length === 0) {
	        continue;
	      }

	      resolvedPath = path + '/' + resolvedPath;
	      resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    }

	    // At this point the path should be resolved to a full absolute path, but
	    // handle relative paths to be safe (might happen when process.cwd() fails)

	    // Normalize the path
	    resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);

	    if (resolvedAbsolute) {
	      if (resolvedPath.length > 0)
	        return '/' + resolvedPath;
	      else
	        return '/';
	    } else if (resolvedPath.length > 0) {
	      return resolvedPath;
	    } else {
	      return '.';
	    }
	  },

	  normalize: function normalize(path) {
	    assertPath(path);

	    if (path.length === 0) return '.';

	    var isAbsolute = path.charCodeAt(0) === 47 /*/*/;
	    var trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/;

	    // Normalize the path
	    path = normalizeStringPosix(path, !isAbsolute);

	    if (path.length === 0 && !isAbsolute) path = '.';
	    if (path.length > 0 && trailingSeparator) path += '/';

	    if (isAbsolute) return '/' + path;
	    return path;
	  },

	  isAbsolute: function isAbsolute(path) {
	    assertPath(path);
	    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/;
	  },

	  join: function join() {
	    if (arguments.length === 0)
	      return '.';
	    var joined;
	    for (var i = 0; i < arguments.length; ++i) {
	      var arg = arguments[i];
	      assertPath(arg);
	      if (arg.length > 0) {
	        if (joined === undefined)
	          joined = arg;
	        else
	          joined += '/' + arg;
	      }
	    }
	    if (joined === undefined)
	      return '.';
	    return posix.normalize(joined);
	  },

	  relative: function relative(from, to) {
	    assertPath(from);
	    assertPath(to);

	    if (from === to) return '';

	    from = posix.resolve(from);
	    to = posix.resolve(to);

	    if (from === to) return '';

	    // Trim any leading backslashes
	    var fromStart = 1;
	    for (; fromStart < from.length; ++fromStart) {
	      if (from.charCodeAt(fromStart) !== 47 /*/*/)
	        break;
	    }
	    var fromEnd = from.length;
	    var fromLen = fromEnd - fromStart;

	    // Trim any leading backslashes
	    var toStart = 1;
	    for (; toStart < to.length; ++toStart) {
	      if (to.charCodeAt(toStart) !== 47 /*/*/)
	        break;
	    }
	    var toEnd = to.length;
	    var toLen = toEnd - toStart;

	    // Compare paths to find the longest common path from root
	    var length = fromLen < toLen ? fromLen : toLen;
	    var lastCommonSep = -1;
	    var i = 0;
	    for (; i <= length; ++i) {
	      if (i === length) {
	        if (toLen > length) {
	          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
	            // We get here if `from` is the exact base path for `to`.
	            // For example: from='/foo/bar'; to='/foo/bar/baz'
	            return to.slice(toStart + i + 1);
	          } else if (i === 0) {
	            // We get here if `from` is the root
	            // For example: from='/'; to='/foo'
	            return to.slice(toStart + i);
	          }
	        } else if (fromLen > length) {
	          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
	            // We get here if `to` is the exact base path for `from`.
	            // For example: from='/foo/bar/baz'; to='/foo/bar'
	            lastCommonSep = i;
	          } else if (i === 0) {
	            // We get here if `to` is the root.
	            // For example: from='/foo'; to='/'
	            lastCommonSep = 0;
	          }
	        }
	        break;
	      }
	      var fromCode = from.charCodeAt(fromStart + i);
	      var toCode = to.charCodeAt(toStart + i);
	      if (fromCode !== toCode)
	        break;
	      else if (fromCode === 47 /*/*/)
	        lastCommonSep = i;
	    }

	    var out = '';
	    // Generate the relative path based on the path difference between `to`
	    // and `from`
	    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
	      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
	        if (out.length === 0)
	          out += '..';
	        else
	          out += '/..';
	      }
	    }

	    // Lastly, append the rest of the destination (`to`) path that comes after
	    // the common path parts
	    if (out.length > 0)
	      return out + to.slice(toStart + lastCommonSep);
	    else {
	      toStart += lastCommonSep;
	      if (to.charCodeAt(toStart) === 47 /*/*/)
	        ++toStart;
	      return to.slice(toStart);
	    }
	  },

	  _makeLong: function _makeLong(path) {
	    return path;
	  },

	  dirname: function dirname(path) {
	    assertPath(path);
	    if (path.length === 0) return '.';
	    var code = path.charCodeAt(0);
	    var hasRoot = code === 47 /*/*/;
	    var end = -1;
	    var matchedSlash = true;
	    for (var i = path.length - 1; i >= 1; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          if (!matchedSlash) {
	            end = i;
	            break;
	          }
	        } else {
	        // We saw the first non-path separator
	        matchedSlash = false;
	      }
	    }

	    if (end === -1) return hasRoot ? '/' : '.';
	    if (hasRoot && end === 1) return '//';
	    return path.slice(0, end);
	  },

	  basename: function basename(path, ext) {
	    if (ext !== undefined && typeof ext !== 'string') throw new TypeError('"ext" argument must be a string');
	    assertPath(path);

	    var start = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i;

	    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
	      if (ext.length === path.length && ext === path) return '';
	      var extIdx = ext.length - 1;
	      var firstNonSlashEnd = -1;
	      for (i = path.length - 1; i >= 0; --i) {
	        var code = path.charCodeAt(i);
	        if (code === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else {
	          if (firstNonSlashEnd === -1) {
	            // We saw the first non-path separator, remember this index in case
	            // we need it if the extension ends up not matching
	            matchedSlash = false;
	            firstNonSlashEnd = i + 1;
	          }
	          if (extIdx >= 0) {
	            // Try to match the explicit extension
	            if (code === ext.charCodeAt(extIdx)) {
	              if (--extIdx === -1) {
	                // We matched the extension, so mark this as the end of our path
	                // component
	                end = i;
	              }
	            } else {
	              // Extension does not match, so our result is the entire path
	              // component
	              extIdx = -1;
	              end = firstNonSlashEnd;
	            }
	          }
	        }
	      }

	      if (start === end) end = firstNonSlashEnd;else if (end === -1) end = path.length;
	      return path.slice(start, end);
	    } else {
	      for (i = path.length - 1; i >= 0; --i) {
	        if (path.charCodeAt(i) === 47 /*/*/) {
	            // If we reached a path separator that was not part of a set of path
	            // separators at the end of the string, stop now
	            if (!matchedSlash) {
	              start = i + 1;
	              break;
	            }
	          } else if (end === -1) {
	          // We saw the first non-path separator, mark this as the end of our
	          // path component
	          matchedSlash = false;
	          end = i + 1;
	        }
	      }

	      if (end === -1) return '';
	      return path.slice(start, end);
	    }
	  },

	  extname: function extname(path) {
	    assertPath(path);
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;
	    for (var i = path.length - 1; i >= 0; --i) {
	      var code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1)
	            startDot = i;
	          else if (preDotState !== 1)
	            preDotState = 1;
	      } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	        // We saw a non-dot character immediately before the dot
	        preDotState === 0 ||
	        // The (right-most) trimmed path component is exactly '..'
	        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      return '';
	    }
	    return path.slice(startDot, end);
	  },

	  format: function format(pathObject) {
	    if (pathObject === null || typeof pathObject !== 'object') {
	      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
	    }
	    return _format('/', pathObject);
	  },

	  parse: function parse(path) {
	    assertPath(path);

	    var ret = { root: '', dir: '', base: '', ext: '', name: '' };
	    if (path.length === 0) return ret;
	    var code = path.charCodeAt(0);
	    var isAbsolute = code === 47 /*/*/;
	    var start;
	    if (isAbsolute) {
	      ret.root = '/';
	      start = 1;
	    } else {
	      start = 0;
	    }
	    var startDot = -1;
	    var startPart = 0;
	    var end = -1;
	    var matchedSlash = true;
	    var i = path.length - 1;

	    // Track the state of characters (if any) we see before our first dot and
	    // after any path separator we find
	    var preDotState = 0;

	    // Get non-dir info
	    for (; i >= start; --i) {
	      code = path.charCodeAt(i);
	      if (code === 47 /*/*/) {
	          // If we reached a path separator that was not part of a set of path
	          // separators at the end of the string, stop now
	          if (!matchedSlash) {
	            startPart = i + 1;
	            break;
	          }
	          continue;
	        }
	      if (end === -1) {
	        // We saw the first non-path separator, mark this as the end of our
	        // extension
	        matchedSlash = false;
	        end = i + 1;
	      }
	      if (code === 46 /*.*/) {
	          // If this is our first dot, mark it as the start of our extension
	          if (startDot === -1) startDot = i;else if (preDotState !== 1) preDotState = 1;
	        } else if (startDot !== -1) {
	        // We saw a non-dot and non-path separator before our dot, so we should
	        // have a good chance at having a non-empty extension
	        preDotState = -1;
	      }
	    }

	    if (startDot === -1 || end === -1 ||
	    // We saw a non-dot character immediately before the dot
	    preDotState === 0 ||
	    // The (right-most) trimmed path component is exactly '..'
	    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
	      if (end !== -1) {
	        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end);else ret.base = ret.name = path.slice(startPart, end);
	      }
	    } else {
	      if (startPart === 0 && isAbsolute) {
	        ret.name = path.slice(1, startDot);
	        ret.base = path.slice(1, end);
	      } else {
	        ret.name = path.slice(startPart, startDot);
	        ret.base = path.slice(startPart, end);
	      }
	      ret.ext = path.slice(startDot, end);
	    }

	    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);else if (isAbsolute) ret.dir = '/';

	    return ret;
	  },

	  sep: '/',
	  delimiter: ':',
	  win32: null,
	  posix: null
	};

	posix.posix = posix;

	pathBrowserify = posix;
	return pathBrowserify;
}

var pathBrowserifyExports = requirePathBrowserify();

const IMAGE_EXT_LIST = [
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".gif",
    ".svg",
    ".tiff",
    ".webp",
    ".avif",
];
function isAnImage(ext) {
    return IMAGE_EXT_LIST.includes(ext.toLowerCase());
}
function isAssetTypeAnImage(path) {
    return isAnImage(pathBrowserifyExports.extname(path));
}
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    // @ts-ignore
    return Buffer.concat(chunks).toString("utf-8");
}
function getUrlAsset(url) {
    return (url = url.substr(1 + url.lastIndexOf("/")).split("?")[0]).split("#")[0];
}
function getLastImage(list) {
    const reversedList = list.reverse();
    let lastImage;
    reversedList.forEach(item => {
        if (item && item.startsWith("http")) {
            lastImage = item;
            return item;
        }
    });
    return lastImage;
}
function arrayToObject(arr, key) {
    const obj = {};
    arr.forEach(element => {
        obj[element[key]] = element;
    });
    return obj;
}
function bufferToArrayBuffer(buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
        view[i] = buffer[i];
    }
    return arrayBuffer;
}
function uuid() {
    return Math.random().toString(36).slice(2);
}

// Primitive types
function dv(array) {
    return new DataView(array.buffer, array.byteOffset);
}
/**
 * 8-bit unsigned integer
 */
const UINT8 = {
    len: 1,
    get(array, offset) {
        return dv(array).getUint8(offset);
    },
    put(array, offset, value) {
        dv(array).setUint8(offset, value);
        return offset + 1;
    }
};
/**
 * 16-bit unsigned integer, Little Endian byte order
 */
const UINT16_LE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value, true);
        return offset + 2;
    }
};
/**
 * 16-bit unsigned integer, Big Endian byte order
 */
const UINT16_BE = {
    len: 2,
    get(array, offset) {
        return dv(array).getUint16(offset);
    },
    put(array, offset, value) {
        dv(array).setUint16(offset, value);
        return offset + 2;
    }
};
/**
 * 32-bit unsigned integer, Little Endian byte order
 */
const UINT32_LE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset, true);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value, true);
        return offset + 4;
    }
};
/**
 * 32-bit unsigned integer, Big Endian byte order
 */
const UINT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getUint32(offset);
    },
    put(array, offset, value) {
        dv(array).setUint32(offset, value);
        return offset + 4;
    }
};
/**
 * 32-bit signed integer, Big Endian byte order
 */
const INT32_BE = {
    len: 4,
    get(array, offset) {
        return dv(array).getInt32(offset);
    },
    put(array, offset, value) {
        dv(array).setInt32(offset, value);
        return offset + 4;
    }
};
/**
 * 64-bit unsigned integer, Little Endian byte order
 */
const UINT64_LE = {
    len: 8,
    get(array, offset) {
        return dv(array).getBigUint64(offset, true);
    },
    put(array, offset, value) {
        dv(array).setBigUint64(offset, value, true);
        return offset + 8;
    }
};
/**
 * Consume a fixed number of bytes from the stream and return a string with a specified encoding.
 */
class StringType {
    constructor(len, encoding) {
        this.len = len;
        this.encoding = encoding;
    }
    get(uint8Array, offset) {
        return node_buffer.Buffer.from(uint8Array).toString(this.encoding, offset, offset + this.len);
    }
}

const defaultMessages = 'End-Of-Stream';
/**
 * Thrown on read operation of the end of file or stream has been reached
 */
class EndOfStreamError extends Error {
    constructor() {
        super(defaultMessages);
    }
}

class Deferred {
    constructor() {
        this.resolve = () => null;
        this.reject = () => null;
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}

class AbstractStreamReader {
    constructor() {
        /**
         * Maximum request length on read-stream operation
         */
        this.maxStreamReadSize = 1 * 1024 * 1024;
        this.endOfStream = false;
        /**
         * Store peeked data
         * @type {Array}
         */
        this.peekQueue = [];
    }
    async peek(uint8Array, offset, length) {
        const bytesRead = await this.read(uint8Array, offset, length);
        this.peekQueue.push(uint8Array.subarray(offset, offset + bytesRead)); // Put read data back to peek buffer
        return bytesRead;
    }
    async read(buffer, offset, length) {
        if (length === 0) {
            return 0;
        }
        let bytesRead = this.readFromPeekBuffer(buffer, offset, length);
        bytesRead += await this.readRemainderFromStream(buffer, offset + bytesRead, length - bytesRead);
        if (bytesRead === 0) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Read chunk from stream
     * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset - Offset target
     * @param length - Number of bytes to read
     * @returns Number of bytes read
     */
    readFromPeekBuffer(buffer, offset, length) {
        let remaining = length;
        let bytesRead = 0;
        // consume peeked data first
        while (this.peekQueue.length > 0 && remaining > 0) {
            const peekData = this.peekQueue.pop(); // Front of queue
            if (!peekData)
                throw new Error('peekData should be defined');
            const lenCopy = Math.min(peekData.length, remaining);
            buffer.set(peekData.subarray(0, lenCopy), offset + bytesRead);
            bytesRead += lenCopy;
            remaining -= lenCopy;
            if (lenCopy < peekData.length) {
                // remainder back to queue
                this.peekQueue.push(peekData.subarray(lenCopy));
            }
        }
        return bytesRead;
    }
    async readRemainderFromStream(buffer, offset, initialRemaining) {
        let remaining = initialRemaining;
        let bytesRead = 0;
        // Continue reading from stream if required
        while (remaining > 0 && !this.endOfStream) {
            const reqLen = Math.min(remaining, this.maxStreamReadSize);
            const chunkLen = await this.readFromStream(buffer, offset + bytesRead, reqLen);
            if (chunkLen === 0)
                break;
            bytesRead += chunkLen;
            remaining -= chunkLen;
        }
        return bytesRead;
    }
}

/**
 * Node.js Readable Stream Reader
 * Ref: https://nodejs.org/api/stream.html#readable-streams
 */
class StreamReader extends AbstractStreamReader {
    constructor(s) {
        super();
        this.s = s;
        /**
         * Deferred used for postponed read request (as not data is yet available to read)
         */
        this.deferred = null;
        if (!s.read || !s.once) {
            throw new Error('Expected an instance of stream.Readable');
        }
        this.s.once('end', () => this.reject(new EndOfStreamError()));
        this.s.once('error', err => this.reject(err));
        this.s.once('close', () => this.reject(new Error('Stream closed')));
    }
    /**
     * Read chunk from stream
     * @param buffer Target Uint8Array (or Buffer) to store data read from stream in
     * @param offset Offset target
     * @param length Number of bytes to read
     * @returns Number of bytes read
     */
    async readFromStream(buffer, offset, length) {
        if (this.endOfStream) {
            return 0;
        }
        const readBuffer = this.s.read(length);
        if (readBuffer) {
            buffer.set(readBuffer, offset);
            return readBuffer.length;
        }
        const request = {
            buffer,
            offset,
            length,
            deferred: new Deferred()
        };
        this.deferred = request.deferred;
        this.s.once('readable', () => {
            this.readDeferred(request);
        });
        return request.deferred.promise;
    }
    /**
     * Process deferred read request
     * @param request Deferred read request
     */
    readDeferred(request) {
        const readBuffer = this.s.read(request.length);
        if (readBuffer) {
            request.buffer.set(readBuffer, request.offset);
            request.deferred.resolve(readBuffer.length);
            this.deferred = null;
        }
        else {
            this.s.once('readable', () => {
                this.readDeferred(request);
            });
        }
    }
    reject(err) {
        this.endOfStream = true;
        if (this.deferred) {
            this.deferred.reject(err);
            this.deferred = null;
        }
    }
    async abort() {
        this.s.destroy();
    }
}

/**
 * Core tokenizer
 */
class AbstractTokenizer {
    constructor(fileInfo) {
        /**
         * Tokenizer-stream position
         */
        this.position = 0;
        this.numBuffer = new Uint8Array(8);
        this.fileInfo = fileInfo ? fileInfo : {};
    }
    /**
     * Read a token from the tokenizer-stream
     * @param token - The token to read
     * @param position - If provided, the desired position in the tokenizer-stream
     * @returns Promise with token data
     */
    async readToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.readBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Peek a token from the tokenizer-stream.
     * @param token - Token to peek from the tokenizer-stream.
     * @param position - Offset where to begin reading within the file. If position is null, data will be read from the current file position.
     * @returns Promise with token data
     */
    async peekToken(token, position = this.position) {
        const uint8Array = new Uint8Array(token.len);
        const len = await this.peekBuffer(uint8Array, { position });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(uint8Array, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async readNumber(token) {
        const len = await this.readBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Read a numeric token from the stream
     * @param token - Numeric token
     * @returns Promise with number
     */
    async peekNumber(token) {
        const len = await this.peekBuffer(this.numBuffer, { length: token.len });
        if (len < token.len)
            throw new EndOfStreamError();
        return token.get(this.numBuffer, 0);
    }
    /**
     * Ignore number of bytes, advances the pointer in under tokenizer-stream.
     * @param length - Number of bytes to ignore
     * @return resolves the number of bytes ignored, equals length if this available, otherwise the number of bytes available
     */
    async ignore(length) {
        if (this.fileInfo.size !== undefined) {
            const bytesLeft = this.fileInfo.size - this.position;
            if (length > bytesLeft) {
                this.position += bytesLeft;
                return bytesLeft;
            }
        }
        this.position += length;
        return length;
    }
    async close() {
        // empty
    }
    normalizeOptions(uint8Array, options) {
        if (options && options.position !== undefined && options.position < this.position) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (options) {
            return {
                mayBeLess: options.mayBeLess === true,
                offset: options.offset ? options.offset : 0,
                length: options.length ? options.length : (uint8Array.length - (options.offset ? options.offset : 0)),
                position: options.position ? options.position : this.position
            };
        }
        return {
            mayBeLess: false,
            offset: 0,
            length: uint8Array.length,
            position: this.position
        };
    }
}

const maxBufferSize = 256000;
class ReadStreamTokenizer extends AbstractTokenizer {
    constructor(streamReader, fileInfo) {
        super(fileInfo);
        this.streamReader = streamReader;
    }
    /**
     * Get file information, an HTTP-client may implement this doing a HEAD request
     * @return Promise with file information
     */
    async getFileInfo() {
        return this.fileInfo;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Target Uint8Array to fill with data read from the tokenizer-stream
     * @param options - Read behaviour options
     * @returns Promise with number of bytes read
     */
    async readBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const skipBytes = normOptions.position - this.position;
        if (skipBytes > 0) {
            await this.ignore(skipBytes);
            return this.readBuffer(uint8Array, options);
        }
        else if (skipBytes < 0) {
            throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
        }
        if (normOptions.length === 0) {
            return 0;
        }
        const bytesRead = await this.streamReader.read(uint8Array, normOptions.offset, normOptions.length);
        this.position += bytesRead;
        if ((!options || !options.mayBeLess) && bytesRead < normOptions.length) {
            throw new EndOfStreamError();
        }
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array - Uint8Array (or Buffer) to write data to
     * @param options - Read behaviour options
     * @returns Promise with number of bytes peeked
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        let bytesRead = 0;
        if (normOptions.position) {
            const skipBytes = normOptions.position - this.position;
            if (skipBytes > 0) {
                const skipBuffer = new Uint8Array(normOptions.length + skipBytes);
                bytesRead = await this.peekBuffer(skipBuffer, { mayBeLess: normOptions.mayBeLess });
                uint8Array.set(skipBuffer.subarray(skipBytes), normOptions.offset);
                return bytesRead - skipBytes;
            }
            else if (skipBytes < 0) {
                throw new Error('Cannot peek from a negative offset in a stream');
            }
        }
        if (normOptions.length > 0) {
            try {
                bytesRead = await this.streamReader.peek(uint8Array, normOptions.offset, normOptions.length);
            }
            catch (err) {
                if (options && options.mayBeLess && err instanceof EndOfStreamError) {
                    return 0;
                }
                throw err;
            }
            if ((!normOptions.mayBeLess) && bytesRead < normOptions.length) {
                throw new EndOfStreamError();
            }
        }
        return bytesRead;
    }
    async ignore(length) {
        // debug(`ignore ${this.position}...${this.position + length - 1}`);
        const bufSize = Math.min(maxBufferSize, length);
        const buf = new Uint8Array(bufSize);
        let totBytesRead = 0;
        while (totBytesRead < length) {
            const remaining = length - totBytesRead;
            const bytesRead = await this.readBuffer(buf, { length: Math.min(bufSize, remaining) });
            if (bytesRead < 0) {
                return bytesRead;
            }
            totBytesRead += bytesRead;
        }
        return totBytesRead;
    }
}

class BufferTokenizer extends AbstractTokenizer {
    /**
     * Construct BufferTokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param fileInfo - Pass additional file information to the tokenizer
     */
    constructor(uint8Array, fileInfo) {
        super(fileInfo);
        this.uint8Array = uint8Array;
        this.fileInfo.size = this.fileInfo.size ? this.fileInfo.size : uint8Array.length;
    }
    /**
     * Read buffer from tokenizer
     * @param uint8Array - Uint8Array to tokenize
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async readBuffer(uint8Array, options) {
        if (options && options.position) {
            if (options.position < this.position) {
                throw new Error('`options.position` must be equal or greater than `tokenizer.position`');
            }
            this.position = options.position;
        }
        const bytesRead = await this.peekBuffer(uint8Array, options);
        this.position += bytesRead;
        return bytesRead;
    }
    /**
     * Peek (read ahead) buffer from tokenizer
     * @param uint8Array
     * @param options - Read behaviour options
     * @returns {Promise<number>}
     */
    async peekBuffer(uint8Array, options) {
        const normOptions = this.normalizeOptions(uint8Array, options);
        const bytes2read = Math.min(this.uint8Array.length - normOptions.position, normOptions.length);
        if ((!normOptions.mayBeLess) && bytes2read < normOptions.length) {
            throw new EndOfStreamError();
        }
        else {
            uint8Array.set(this.uint8Array.subarray(normOptions.position, normOptions.position + bytes2read), normOptions.offset);
            return bytes2read;
        }
    }
    async close() {
        // empty
    }
}

/**
 * Construct ReadStreamTokenizer from given Stream.
 * Will set fileSize, if provided given Stream has set the .path property/
 * @param stream - Read from Node.js Stream.Readable
 * @param fileInfo - Pass the file information, like size and MIME-type of the corresponding stream.
 * @returns ReadStreamTokenizer
 */
function fromStream(stream, fileInfo) {
    fileInfo = fileInfo ? fileInfo : {};
    return new ReadStreamTokenizer(new StreamReader(stream), fileInfo);
}
/**
 * Construct ReadStreamTokenizer from given Buffer.
 * @param uint8Array - Uint8Array to tokenize
 * @param fileInfo - Pass additional file information to the tokenizer
 * @returns BufferTokenizer
 */
function fromBuffer(uint8Array, fileInfo) {
    return new BufferTokenizer(uint8Array, fileInfo);
}

function stringToBytes(string) {
	return [...string].map(character => character.charCodeAt(0)); // eslint-disable-line unicorn/prefer-code-point
}

/**
Checks whether the TAR checksum is valid.

@param {Buffer} buffer - The TAR header `[offset ... offset + 512]`.
@param {number} offset - TAR header offset.
@returns {boolean} `true` if the TAR checksum is valid, otherwise `false`.
*/
function tarHeaderChecksumMatches(buffer, offset = 0) {
	const readSum = Number.parseInt(buffer.toString('utf8', 148, 154).replace(/\0.*$/, '').trim(), 8); // Read sum in header
	if (Number.isNaN(readSum)) {
		return false;
	}

	let sum = 8 * 0x20; // Initialize signed bit sum

	for (let index = offset; index < offset + 148; index++) {
		sum += buffer[index];
	}

	for (let index = offset + 156; index < offset + 512; index++) {
		sum += buffer[index];
	}

	return readSum === sum;
}

/**
ID3 UINT32 sync-safe tokenizer token.
28 bits (representing up to 256MB) integer, the msb is 0 to avoid "false syncsignals".
*/
const uint32SyncSafeToken = {
	get: (buffer, offset) => (buffer[offset + 3] & 0x7F) | ((buffer[offset + 2]) << 7) | ((buffer[offset + 1]) << 14) | ((buffer[offset]) << 21),
	len: 4,
};

const extensions = [
	'jpg',
	'png',
	'apng',
	'gif',
	'webp',
	'flif',
	'xcf',
	'cr2',
	'cr3',
	'orf',
	'arw',
	'dng',
	'nef',
	'rw2',
	'raf',
	'tif',
	'bmp',
	'icns',
	'jxr',
	'psd',
	'indd',
	'zip',
	'tar',
	'rar',
	'gz',
	'bz2',
	'7z',
	'dmg',
	'mp4',
	'mid',
	'mkv',
	'webm',
	'mov',
	'avi',
	'mpg',
	'mp2',
	'mp3',
	'm4a',
	'oga',
	'ogg',
	'ogv',
	'opus',
	'flac',
	'wav',
	'spx',
	'amr',
	'pdf',
	'epub',
	'elf',
	'macho',
	'exe',
	'swf',
	'rtf',
	'wasm',
	'woff',
	'woff2',
	'eot',
	'ttf',
	'otf',
	'ico',
	'flv',
	'ps',
	'xz',
	'sqlite',
	'nes',
	'crx',
	'xpi',
	'cab',
	'deb',
	'ar',
	'rpm',
	'Z',
	'lz',
	'cfb',
	'mxf',
	'mts',
	'blend',
	'bpg',
	'docx',
	'pptx',
	'xlsx',
	'3gp',
	'3g2',
	'j2c',
	'jp2',
	'jpm',
	'jpx',
	'mj2',
	'aif',
	'qcp',
	'odt',
	'ods',
	'odp',
	'xml',
	'mobi',
	'heic',
	'cur',
	'ktx',
	'ape',
	'wv',
	'dcm',
	'ics',
	'glb',
	'pcap',
	'dsf',
	'lnk',
	'alias',
	'voc',
	'ac3',
	'm4v',
	'm4p',
	'm4b',
	'f4v',
	'f4p',
	'f4b',
	'f4a',
	'mie',
	'asf',
	'ogm',
	'ogx',
	'mpc',
	'arrow',
	'shp',
	'aac',
	'mp1',
	'it',
	's3m',
	'xm',
	'ai',
	'skp',
	'avif',
	'eps',
	'lzh',
	'pgp',
	'asar',
	'stl',
	'chm',
	'3mf',
	'zst',
	'jxl',
	'vcf',
	'jls',
	'pst',
	'dwg',
	'parquet',
	'class',
	'arj',
	'cpio',
	'ace',
	'avro',
	'icc',
	'fbx',
];

const mimeTypes = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/flif',
	'image/x-xcf',
	'image/x-canon-cr2',
	'image/x-canon-cr3',
	'image/tiff',
	'image/bmp',
	'image/vnd.ms-photo',
	'image/vnd.adobe.photoshop',
	'application/x-indesign',
	'application/epub+zip',
	'application/x-xpinstall',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.presentation',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/zip',
	'application/x-tar',
	'application/x-rar-compressed',
	'application/gzip',
	'application/x-bzip2',
	'application/x-7z-compressed',
	'application/x-apple-diskimage',
	'application/x-apache-arrow',
	'video/mp4',
	'audio/midi',
	'video/x-matroska',
	'video/webm',
	'video/quicktime',
	'video/vnd.avi',
	'audio/vnd.wave',
	'audio/qcelp',
	'audio/x-ms-asf',
	'video/x-ms-asf',
	'application/vnd.ms-asf',
	'video/mpeg',
	'video/3gpp',
	'audio/mpeg',
	'audio/mp4', // RFC 4337
	'audio/opus',
	'video/ogg',
	'audio/ogg',
	'application/ogg',
	'audio/x-flac',
	'audio/ape',
	'audio/wavpack',
	'audio/amr',
	'application/pdf',
	'application/x-elf',
	'application/x-mach-binary',
	'application/x-msdownload',
	'application/x-shockwave-flash',
	'application/rtf',
	'application/wasm',
	'font/woff',
	'font/woff2',
	'application/vnd.ms-fontobject',
	'font/ttf',
	'font/otf',
	'image/x-icon',
	'video/x-flv',
	'application/postscript',
	'application/eps',
	'application/x-xz',
	'application/x-sqlite3',
	'application/x-nintendo-nes-rom',
	'application/x-google-chrome-extension',
	'application/vnd.ms-cab-compressed',
	'application/x-deb',
	'application/x-unix-archive',
	'application/x-rpm',
	'application/x-compress',
	'application/x-lzip',
	'application/x-cfb',
	'application/x-mie',
	'application/mxf',
	'video/mp2t',
	'application/x-blender',
	'image/bpg',
	'image/j2c',
	'image/jp2',
	'image/jpx',
	'image/jpm',
	'image/mj2',
	'audio/aiff',
	'application/xml',
	'application/x-mobipocket-ebook',
	'image/heif',
	'image/heif-sequence',
	'image/heic',
	'image/heic-sequence',
	'image/icns',
	'image/ktx',
	'application/dicom',
	'audio/x-musepack',
	'text/calendar',
	'text/vcard',
	'model/gltf-binary',
	'application/vnd.tcpdump.pcap',
	'audio/x-dsf', // Non-standard
	'application/x.ms.shortcut', // Invented by us
	'application/x.apple.alias', // Invented by us
	'audio/x-voc',
	'audio/vnd.dolby.dd-raw',
	'audio/x-m4a',
	'image/apng',
	'image/x-olympus-orf',
	'image/x-sony-arw',
	'image/x-adobe-dng',
	'image/x-nikon-nef',
	'image/x-panasonic-rw2',
	'image/x-fujifilm-raf',
	'video/x-m4v',
	'video/3gpp2',
	'application/x-esri-shape',
	'audio/aac',
	'audio/x-it',
	'audio/x-s3m',
	'audio/x-xm',
	'video/MP1S',
	'video/MP2P',
	'application/vnd.sketchup.skp',
	'image/avif',
	'application/x-lzh-compressed',
	'application/pgp-encrypted',
	'application/x-asar',
	'model/stl',
	'application/vnd.ms-htmlhelp',
	'model/3mf',
	'image/jxl',
	'application/zstd',
	'image/jls',
	'application/vnd.ms-outlook',
	'image/vnd.dwg',
	'application/x-parquet',
	'application/java-vm',
	'application/x-arj',
	'application/x-cpio',
	'application/x-ace-compressed',
	'application/avro',
	'application/vnd.iccprofile',
	'application/x.autodesk.fbx', // Invented by us
];

const minimumBytes = 4100; // A fair amount of file-types are detectable within this range.

async function fileTypeFromBuffer(input) {
	return new FileTypeParser().fromBuffer(input);
}

function _check(buffer, headers, options) {
	options = {
		offset: 0,
		...options,
	};

	for (const [index, header] of headers.entries()) {
		// If a bitmask is set
		if (options.mask) {
			// If header doesn't equal `buf` with bits masked off
			if (header !== (options.mask[index] & buffer[index + options.offset])) {
				return false;
			}
		} else if (header !== buffer[index + options.offset]) {
			return false;
		}
	}

	return true;
}

class FileTypeParser {
	constructor(options) {
		this.detectors = options?.customDetectors;

		this.fromTokenizer = this.fromTokenizer.bind(this);
		this.fromBuffer = this.fromBuffer.bind(this);
		this.parse = this.parse.bind(this);
	}

	async fromTokenizer(tokenizer) {
		const initialPosition = tokenizer.position;

		for (const detector of this.detectors || []) {
			const fileType = await detector(tokenizer);
			if (fileType) {
				return fileType;
			}

			if (initialPosition !== tokenizer.position) {
				return undefined; // Cannot proceed scanning of the tokenizer is at an arbitrary position
			}
		}

		return this.parse(tokenizer);
	}

	async fromBuffer(input) {
		if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) {
			throw new TypeError(`Expected the \`input\` argument to be of type \`Uint8Array\` or \`Buffer\` or \`ArrayBuffer\`, got \`${typeof input}\``);
		}

		const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

		if (!(buffer?.length > 1)) {
			return;
		}

		return this.fromTokenizer(fromBuffer(buffer));
	}

	async fromBlob(blob) {
		const buffer = await blob.arrayBuffer();
		return this.fromBuffer(new Uint8Array(buffer));
	}

	async fromStream(stream) {
		const tokenizer = await fromStream(stream);
		try {
			return await this.fromTokenizer(tokenizer);
		} finally {
			await tokenizer.close();
		}
	}

	async toDetectionStream(readableStream, options = {}) {
		const {default: stream} = await import('node:stream');
		const {sampleSize = minimumBytes} = options;

		return new Promise((resolve, reject) => {
			readableStream.on('error', reject);

			readableStream.once('readable', () => {
				(async () => {
					try {
						// Set up output stream
						const pass = new stream.PassThrough();
						const outputStream = stream.pipeline ? stream.pipeline(readableStream, pass, () => {}) : readableStream.pipe(pass);

						// Read the input stream and detect the filetype
						const chunk = readableStream.read(sampleSize) ?? readableStream.read() ?? node_buffer.Buffer.alloc(0);
						try {
							pass.fileType = await this.fromBuffer(chunk);
						} catch (error) {
							if (error instanceof EndOfStreamError) {
								pass.fileType = undefined;
							} else {
								reject(error);
							}
						}

						resolve(outputStream);
					} catch (error) {
						reject(error);
					}
				})();
			});
		});
	}

	check(header, options) {
		return _check(this.buffer, header, options);
	}

	checkString(header, options) {
		return this.check(stringToBytes(header), options);
	}

	async parse(tokenizer) {
		this.buffer = node_buffer.Buffer.alloc(minimumBytes);

		// Keep reading until EOF if the file size is unknown.
		if (tokenizer.fileInfo.size === undefined) {
			tokenizer.fileInfo.size = Number.MAX_SAFE_INTEGER;
		}

		this.tokenizer = tokenizer;

		await tokenizer.peekBuffer(this.buffer, {length: 12, mayBeLess: true});

		// -- 2-byte signatures --

		if (this.check([0x42, 0x4D])) {
			return {
				ext: 'bmp',
				mime: 'image/bmp',
			};
		}

		if (this.check([0x0B, 0x77])) {
			return {
				ext: 'ac3',
				mime: 'audio/vnd.dolby.dd-raw',
			};
		}

		if (this.check([0x78, 0x01])) {
			return {
				ext: 'dmg',
				mime: 'application/x-apple-diskimage',
			};
		}

		if (this.check([0x4D, 0x5A])) {
			return {
				ext: 'exe',
				mime: 'application/x-msdownload',
			};
		}

		if (this.check([0x25, 0x21])) {
			await tokenizer.peekBuffer(this.buffer, {length: 24, mayBeLess: true});

			if (
				this.checkString('PS-Adobe-', {offset: 2})
				&& this.checkString(' EPSF-', {offset: 14})
			) {
				return {
					ext: 'eps',
					mime: 'application/eps',
				};
			}

			return {
				ext: 'ps',
				mime: 'application/postscript',
			};
		}

		if (
			this.check([0x1F, 0xA0])
			|| this.check([0x1F, 0x9D])
		) {
			return {
				ext: 'Z',
				mime: 'application/x-compress',
			};
		}

		if (this.check([0xC7, 0x71])) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		if (this.check([0x60, 0xEA])) {
			return {
				ext: 'arj',
				mime: 'application/x-arj',
			};
		}

		// -- 3-byte signatures --

		if (this.check([0xEF, 0xBB, 0xBF])) { // UTF-8-BOM
			// Strip off UTF-8-BOM
			this.tokenizer.ignore(3);
			return this.parse(tokenizer);
		}

		if (this.check([0x47, 0x49, 0x46])) {
			return {
				ext: 'gif',
				mime: 'image/gif',
			};
		}

		if (this.check([0x49, 0x49, 0xBC])) {
			return {
				ext: 'jxr',
				mime: 'image/vnd.ms-photo',
			};
		}

		if (this.check([0x1F, 0x8B, 0x8])) {
			return {
				ext: 'gz',
				mime: 'application/gzip',
			};
		}

		if (this.check([0x42, 0x5A, 0x68])) {
			return {
				ext: 'bz2',
				mime: 'application/x-bzip2',
			};
		}

		if (this.checkString('ID3')) {
			await tokenizer.ignore(6); // Skip ID3 header until the header size
			const id3HeaderLength = await tokenizer.readToken(uint32SyncSafeToken);
			if (tokenizer.position + id3HeaderLength > tokenizer.fileInfo.size) {
				// Guess file type based on ID3 header for backward compatibility
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			await tokenizer.ignore(id3HeaderLength);
			return this.fromTokenizer(tokenizer); // Skip ID3 header, recursion
		}

		// Musepack, SV7
		if (this.checkString('MP+')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (
			(this.buffer[0] === 0x43 || this.buffer[0] === 0x46)
			&& this.check([0x57, 0x53], {offset: 1})
		) {
			return {
				ext: 'swf',
				mime: 'application/x-shockwave-flash',
			};
		}

		// -- 4-byte signatures --

		// Requires a sample size of 4 bytes
		if (this.check([0xFF, 0xD8, 0xFF])) {
			if (this.check([0xF7], {offset: 3})) { // JPG7/SOF55, indicating a ISO/IEC 14495 / JPEG-LS file
				return {
					ext: 'jls',
					mime: 'image/jls',
				};
			}

			return {
				ext: 'jpg',
				mime: 'image/jpeg',
			};
		}

		if (this.check([0x4F, 0x62, 0x6A, 0x01])) {
			return {
				ext: 'avro',
				mime: 'application/avro',
			};
		}

		if (this.checkString('FLIF')) {
			return {
				ext: 'flif',
				mime: 'image/flif',
			};
		}

		if (this.checkString('8BPS')) {
			return {
				ext: 'psd',
				mime: 'image/vnd.adobe.photoshop',
			};
		}

		if (this.checkString('WEBP', {offset: 8})) {
			return {
				ext: 'webp',
				mime: 'image/webp',
			};
		}

		// Musepack, SV8
		if (this.checkString('MPCK')) {
			return {
				ext: 'mpc',
				mime: 'audio/x-musepack',
			};
		}

		if (this.checkString('FORM')) {
			return {
				ext: 'aif',
				mime: 'audio/aiff',
			};
		}

		if (this.checkString('icns', {offset: 0})) {
			return {
				ext: 'icns',
				mime: 'image/icns',
			};
		}

		// Zip-based file formats
		// Need to be before the `zip` check
		if (this.check([0x50, 0x4B, 0x3, 0x4])) { // Local file header signature
			try {
				while (tokenizer.position + 30 < tokenizer.fileInfo.size) {
					await tokenizer.readBuffer(this.buffer, {length: 30});

					// https://en.wikipedia.org/wiki/Zip_(file_format)#File_headers
					const zipHeader = {
						compressedSize: this.buffer.readUInt32LE(18),
						uncompressedSize: this.buffer.readUInt32LE(22),
						filenameLength: this.buffer.readUInt16LE(26),
						extraFieldLength: this.buffer.readUInt16LE(28),
					};

					zipHeader.filename = await tokenizer.readToken(new StringType(zipHeader.filenameLength, 'utf-8'));
					await tokenizer.ignore(zipHeader.extraFieldLength);

					// Assumes signed `.xpi` from addons.mozilla.org
					if (zipHeader.filename === 'META-INF/mozilla.rsa') {
						return {
							ext: 'xpi',
							mime: 'application/x-xpinstall',
						};
					}

					if (zipHeader.filename.endsWith('.rels') || zipHeader.filename.endsWith('.xml')) {
						const type = zipHeader.filename.split('/')[0];
						switch (type) {
							case '_rels':
								break;
							case 'word':
								return {
									ext: 'docx',
									mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
								};
							case 'ppt':
								return {
									ext: 'pptx',
									mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
								};
							case 'xl':
								return {
									ext: 'xlsx',
									mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
								};
							default:
								break;
						}
					}

					if (zipHeader.filename.startsWith('xl/')) {
						return {
							ext: 'xlsx',
							mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						};
					}

					if (zipHeader.filename.startsWith('3D/') && zipHeader.filename.endsWith('.model')) {
						return {
							ext: '3mf',
							mime: 'model/3mf',
						};
					}

					// The docx, xlsx and pptx file types extend the Office Open XML file format:
					// https://en.wikipedia.org/wiki/Office_Open_XML_file_formats
					// We look for:
					// - one entry named '[Content_Types].xml' or '_rels/.rels',
					// - one entry indicating specific type of file.
					// MS Office, OpenOffice and LibreOffice may put the parts in different order, so the check should not rely on it.
					if (zipHeader.filename === 'mimetype' && zipHeader.compressedSize === zipHeader.uncompressedSize) {
						let mimeType = await tokenizer.readToken(new StringType(zipHeader.compressedSize, 'utf-8'));
						mimeType = mimeType.trim();

						switch (mimeType) {
							case 'application/epub+zip':
								return {
									ext: 'epub',
									mime: 'application/epub+zip',
								};
							case 'application/vnd.oasis.opendocument.text':
								return {
									ext: 'odt',
									mime: 'application/vnd.oasis.opendocument.text',
								};
							case 'application/vnd.oasis.opendocument.spreadsheet':
								return {
									ext: 'ods',
									mime: 'application/vnd.oasis.opendocument.spreadsheet',
								};
							case 'application/vnd.oasis.opendocument.presentation':
								return {
									ext: 'odp',
									mime: 'application/vnd.oasis.opendocument.presentation',
								};
							default:
						}
					}

					// Try to find next header manually when current one is corrupted
					if (zipHeader.compressedSize === 0) {
						let nextHeaderIndex = -1;

						while (nextHeaderIndex < 0 && (tokenizer.position < tokenizer.fileInfo.size)) {
							await tokenizer.peekBuffer(this.buffer, {mayBeLess: true});

							nextHeaderIndex = this.buffer.indexOf('504B0304', 0, 'hex');
							// Move position to the next header if found, skip the whole buffer otherwise
							await tokenizer.ignore(nextHeaderIndex >= 0 ? nextHeaderIndex : this.buffer.length);
						}
					} else {
						await tokenizer.ignore(zipHeader.compressedSize);
					}
				}
			} catch (error) {
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		if (this.checkString('OggS')) {
			// This is an OGG container
			await tokenizer.ignore(28);
			const type = node_buffer.Buffer.alloc(8);
			await tokenizer.readBuffer(type);

			// Needs to be before `ogg` check
			if (_check(type, [0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64])) {
				return {
					ext: 'opus',
					mime: 'audio/opus',
				};
			}

			// If ' theora' in header.
			if (_check(type, [0x80, 0x74, 0x68, 0x65, 0x6F, 0x72, 0x61])) {
				return {
					ext: 'ogv',
					mime: 'video/ogg',
				};
			}

			// If '\x01video' in header.
			if (_check(type, [0x01, 0x76, 0x69, 0x64, 0x65, 0x6F, 0x00])) {
				return {
					ext: 'ogm',
					mime: 'video/ogg',
				};
			}

			// If ' FLAC' in header  https://xiph.org/flac/faq.html
			if (_check(type, [0x7F, 0x46, 0x4C, 0x41, 0x43])) {
				return {
					ext: 'oga',
					mime: 'audio/ogg',
				};
			}

			// 'Speex  ' in header https://en.wikipedia.org/wiki/Speex
			if (_check(type, [0x53, 0x70, 0x65, 0x65, 0x78, 0x20, 0x20])) {
				return {
					ext: 'spx',
					mime: 'audio/ogg',
				};
			}

			// If '\x01vorbis' in header
			if (_check(type, [0x01, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73])) {
				return {
					ext: 'ogg',
					mime: 'audio/ogg',
				};
			}

			// Default OGG container https://www.iana.org/assignments/media-types/application/ogg
			return {
				ext: 'ogx',
				mime: 'application/ogg',
			};
		}

		if (
			this.check([0x50, 0x4B])
			&& (this.buffer[2] === 0x3 || this.buffer[2] === 0x5 || this.buffer[2] === 0x7)
			&& (this.buffer[3] === 0x4 || this.buffer[3] === 0x6 || this.buffer[3] === 0x8)
		) {
			return {
				ext: 'zip',
				mime: 'application/zip',
			};
		}

		//

		// File Type Box (https://en.wikipedia.org/wiki/ISO_base_media_file_format)
		// It's not required to be first, but it's recommended to be. Almost all ISO base media files start with `ftyp` box.
		// `ftyp` box must contain a brand major identifier, which must consist of ISO 8859-1 printable characters.
		// Here we check for 8859-1 printable characters (for simplicity, it's a mask which also catches one non-printable character).
		if (
			this.checkString('ftyp', {offset: 4})
			&& (this.buffer[8] & 0x60) !== 0x00 // Brand major, first character ASCII?
		) {
			// They all can have MIME `video/mp4` except `application/mp4` special-case which is hard to detect.
			// For some cases, we're specific, everything else falls to `video/mp4` with `mp4` extension.
			const brandMajor = this.buffer.toString('binary', 8, 12).replace('\0', ' ').trim();
			switch (brandMajor) {
				case 'avif':
				case 'avis':
					return {ext: 'avif', mime: 'image/avif'};
				case 'mif1':
					return {ext: 'heic', mime: 'image/heif'};
				case 'msf1':
					return {ext: 'heic', mime: 'image/heif-sequence'};
				case 'heic':
				case 'heix':
					return {ext: 'heic', mime: 'image/heic'};
				case 'hevc':
				case 'hevx':
					return {ext: 'heic', mime: 'image/heic-sequence'};
				case 'qt':
					return {ext: 'mov', mime: 'video/quicktime'};
				case 'M4V':
				case 'M4VH':
				case 'M4VP':
					return {ext: 'm4v', mime: 'video/x-m4v'};
				case 'M4P':
					return {ext: 'm4p', mime: 'video/mp4'};
				case 'M4B':
					return {ext: 'm4b', mime: 'audio/mp4'};
				case 'M4A':
					return {ext: 'm4a', mime: 'audio/x-m4a'};
				case 'F4V':
					return {ext: 'f4v', mime: 'video/mp4'};
				case 'F4P':
					return {ext: 'f4p', mime: 'video/mp4'};
				case 'F4A':
					return {ext: 'f4a', mime: 'audio/mp4'};
				case 'F4B':
					return {ext: 'f4b', mime: 'audio/mp4'};
				case 'crx':
					return {ext: 'cr3', mime: 'image/x-canon-cr3'};
				default:
					if (brandMajor.startsWith('3g')) {
						if (brandMajor.startsWith('3g2')) {
							return {ext: '3g2', mime: 'video/3gpp2'};
						}

						return {ext: '3gp', mime: 'video/3gpp'};
					}

					return {ext: 'mp4', mime: 'video/mp4'};
			}
		}

		if (this.checkString('MThd')) {
			return {
				ext: 'mid',
				mime: 'audio/midi',
			};
		}

		if (
			this.checkString('wOFF')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff',
				mime: 'font/woff',
			};
		}

		if (
			this.checkString('wOF2')
			&& (
				this.check([0x00, 0x01, 0x00, 0x00], {offset: 4})
				|| this.checkString('OTTO', {offset: 4})
			)
		) {
			return {
				ext: 'woff2',
				mime: 'font/woff2',
			};
		}

		if (this.check([0xD4, 0xC3, 0xB2, 0xA1]) || this.check([0xA1, 0xB2, 0xC3, 0xD4])) {
			return {
				ext: 'pcap',
				mime: 'application/vnd.tcpdump.pcap',
			};
		}

		// Sony DSD Stream File (DSF)
		if (this.checkString('DSD ')) {
			return {
				ext: 'dsf',
				mime: 'audio/x-dsf', // Non-standard
			};
		}

		if (this.checkString('LZIP')) {
			return {
				ext: 'lz',
				mime: 'application/x-lzip',
			};
		}

		if (this.checkString('fLaC')) {
			return {
				ext: 'flac',
				mime: 'audio/x-flac',
			};
		}

		if (this.check([0x42, 0x50, 0x47, 0xFB])) {
			return {
				ext: 'bpg',
				mime: 'image/bpg',
			};
		}

		if (this.checkString('wvpk')) {
			return {
				ext: 'wv',
				mime: 'audio/wavpack',
			};
		}

		if (this.checkString('%PDF')) {
			try {
				await tokenizer.ignore(1350);
				const maxBufferSize = 10 * 1024 * 1024;
				const buffer = node_buffer.Buffer.alloc(Math.min(maxBufferSize, tokenizer.fileInfo.size));
				await tokenizer.readBuffer(buffer, {mayBeLess: true});

				// Check if this is an Adobe Illustrator file
				if (buffer.includes(node_buffer.Buffer.from('AIPrivateData'))) {
					return {
						ext: 'ai',
						mime: 'application/postscript',
					};
				}
			} catch (error) {
				// Swallow end of stream error if file is too small for the Adobe AI check
				if (!(error instanceof EndOfStreamError)) {
					throw error;
				}
			}

			// Assume this is just a normal PDF
			return {
				ext: 'pdf',
				mime: 'application/pdf',
			};
		}

		if (this.check([0x00, 0x61, 0x73, 0x6D])) {
			return {
				ext: 'wasm',
				mime: 'application/wasm',
			};
		}

		// TIFF, little-endian type
		if (this.check([0x49, 0x49])) {
			const fileType = await this.readTiffHeader(false);
			if (fileType) {
				return fileType;
			}
		}

		// TIFF, big-endian type
		if (this.check([0x4D, 0x4D])) {
			const fileType = await this.readTiffHeader(true);
			if (fileType) {
				return fileType;
			}
		}

		if (this.checkString('MAC ')) {
			return {
				ext: 'ape',
				mime: 'audio/ape',
			};
		}

		// https://github.com/file/file/blob/master/magic/Magdir/matroska
		if (this.check([0x1A, 0x45, 0xDF, 0xA3])) { // Root element: EBML
			async function readField() {
				const msb = await tokenizer.peekNumber(UINT8);
				let mask = 0x80;
				let ic = 0; // 0 = A, 1 = B, 2 = C, 3
				// = D

				while ((msb & mask) === 0 && mask !== 0) {
					++ic;
					mask >>= 1;
				}

				const id = node_buffer.Buffer.alloc(ic + 1);
				await tokenizer.readBuffer(id);
				return id;
			}

			async function readElement() {
				const id = await readField();
				const lengthField = await readField();
				lengthField[0] ^= 0x80 >> (lengthField.length - 1);
				const nrLength = Math.min(6, lengthField.length); // JavaScript can max read 6 bytes integer
				return {
					id: id.readUIntBE(0, id.length),
					len: lengthField.readUIntBE(lengthField.length - nrLength, nrLength),
				};
			}

			async function readChildren(children) {
				while (children > 0) {
					const element = await readElement();
					if (element.id === 0x42_82) {
						const rawValue = await tokenizer.readToken(new StringType(element.len, 'utf-8'));
						return rawValue.replace(/\00.*$/g, ''); // Return DocType
					}

					await tokenizer.ignore(element.len); // ignore payload
					--children;
				}
			}

			const re = await readElement();
			const docType = await readChildren(re.len);

			switch (docType) {
				case 'webm':
					return {
						ext: 'webm',
						mime: 'video/webm',
					};

				case 'matroska':
					return {
						ext: 'mkv',
						mime: 'video/x-matroska',
					};

				default:
					return;
			}
		}

		// RIFF file format which might be AVI, WAV, QCP, etc
		if (this.check([0x52, 0x49, 0x46, 0x46])) {
			if (this.check([0x41, 0x56, 0x49], {offset: 8})) {
				return {
					ext: 'avi',
					mime: 'video/vnd.avi',
				};
			}

			if (this.check([0x57, 0x41, 0x56, 0x45], {offset: 8})) {
				return {
					ext: 'wav',
					mime: 'audio/vnd.wave',
				};
			}

			// QLCM, QCP file
			if (this.check([0x51, 0x4C, 0x43, 0x4D], {offset: 8})) {
				return {
					ext: 'qcp',
					mime: 'audio/qcelp',
				};
			}
		}

		if (this.checkString('SQLi')) {
			return {
				ext: 'sqlite',
				mime: 'application/x-sqlite3',
			};
		}

		if (this.check([0x4E, 0x45, 0x53, 0x1A])) {
			return {
				ext: 'nes',
				mime: 'application/x-nintendo-nes-rom',
			};
		}

		if (this.checkString('Cr24')) {
			return {
				ext: 'crx',
				mime: 'application/x-google-chrome-extension',
			};
		}

		if (
			this.checkString('MSCF')
			|| this.checkString('ISc(')
		) {
			return {
				ext: 'cab',
				mime: 'application/vnd.ms-cab-compressed',
			};
		}

		if (this.check([0xED, 0xAB, 0xEE, 0xDB])) {
			return {
				ext: 'rpm',
				mime: 'application/x-rpm',
			};
		}

		if (this.check([0xC5, 0xD0, 0xD3, 0xC6])) {
			return {
				ext: 'eps',
				mime: 'application/eps',
			};
		}

		if (this.check([0x28, 0xB5, 0x2F, 0xFD])) {
			return {
				ext: 'zst',
				mime: 'application/zstd',
			};
		}

		if (this.check([0x7F, 0x45, 0x4C, 0x46])) {
			return {
				ext: 'elf',
				mime: 'application/x-elf',
			};
		}

		if (this.check([0x21, 0x42, 0x44, 0x4E])) {
			return {
				ext: 'pst',
				mime: 'application/vnd.ms-outlook',
			};
		}

		if (this.checkString('PAR1')) {
			return {
				ext: 'parquet',
				mime: 'application/x-parquet',
			};
		}

		if (this.check([0xCF, 0xFA, 0xED, 0xFE])) {
			return {
				ext: 'macho',
				mime: 'application/x-mach-binary',
			};
		}

		// -- 5-byte signatures --

		if (this.check([0x4F, 0x54, 0x54, 0x4F, 0x00])) {
			return {
				ext: 'otf',
				mime: 'font/otf',
			};
		}

		if (this.checkString('#!AMR')) {
			return {
				ext: 'amr',
				mime: 'audio/amr',
			};
		}

		if (this.checkString('{\\rtf')) {
			return {
				ext: 'rtf',
				mime: 'application/rtf',
			};
		}

		if (this.check([0x46, 0x4C, 0x56, 0x01])) {
			return {
				ext: 'flv',
				mime: 'video/x-flv',
			};
		}

		if (this.checkString('IMPM')) {
			return {
				ext: 'it',
				mime: 'audio/x-it',
			};
		}

		if (
			this.checkString('-lh0-', {offset: 2})
			|| this.checkString('-lh1-', {offset: 2})
			|| this.checkString('-lh2-', {offset: 2})
			|| this.checkString('-lh3-', {offset: 2})
			|| this.checkString('-lh4-', {offset: 2})
			|| this.checkString('-lh5-', {offset: 2})
			|| this.checkString('-lh6-', {offset: 2})
			|| this.checkString('-lh7-', {offset: 2})
			|| this.checkString('-lzs-', {offset: 2})
			|| this.checkString('-lz4-', {offset: 2})
			|| this.checkString('-lz5-', {offset: 2})
			|| this.checkString('-lhd-', {offset: 2})
		) {
			return {
				ext: 'lzh',
				mime: 'application/x-lzh-compressed',
			};
		}

		// MPEG program stream (PS or MPEG-PS)
		if (this.check([0x00, 0x00, 0x01, 0xBA])) {
			//  MPEG-PS, MPEG-1 Part 1
			if (this.check([0x21], {offset: 4, mask: [0xF1]})) {
				return {
					ext: 'mpg', // May also be .ps, .mpeg
					mime: 'video/MP1S',
				};
			}

			// MPEG-PS, MPEG-2 Part 1
			if (this.check([0x44], {offset: 4, mask: [0xC4]})) {
				return {
					ext: 'mpg', // May also be .mpg, .m2p, .vob or .sub
					mime: 'video/MP2P',
				};
			}
		}

		if (this.checkString('ITSF')) {
			return {
				ext: 'chm',
				mime: 'application/vnd.ms-htmlhelp',
			};
		}

		if (this.check([0xCA, 0xFE, 0xBA, 0xBE])) {
			return {
				ext: 'class',
				mime: 'application/java-vm',
			};
		}

		// -- 6-byte signatures --

		if (this.check([0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00])) {
			return {
				ext: 'xz',
				mime: 'application/x-xz',
			};
		}

		if (this.checkString('<?xml ')) {
			return {
				ext: 'xml',
				mime: 'application/xml',
			};
		}

		if (this.check([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
			return {
				ext: '7z',
				mime: 'application/x-7z-compressed',
			};
		}

		if (
			this.check([0x52, 0x61, 0x72, 0x21, 0x1A, 0x7])
			&& (this.buffer[6] === 0x0 || this.buffer[6] === 0x1)
		) {
			return {
				ext: 'rar',
				mime: 'application/x-rar-compressed',
			};
		}

		if (this.checkString('solid ')) {
			return {
				ext: 'stl',
				mime: 'model/stl',
			};
		}

		if (this.checkString('AC')) {
			const version = this.buffer.toString('binary', 2, 6);
			if (version.match('^d*') && version >= 1000 && version <= 1050) {
				return {
					ext: 'dwg',
					mime: 'image/vnd.dwg',
				};
			}
		}

		if (this.checkString('070707')) {
			return {
				ext: 'cpio',
				mime: 'application/x-cpio',
			};
		}

		// -- 7-byte signatures --

		if (this.checkString('BLENDER')) {
			return {
				ext: 'blend',
				mime: 'application/x-blender',
			};
		}

		if (this.checkString('!<arch>')) {
			await tokenizer.ignore(8);
			const string = await tokenizer.readToken(new StringType(13, 'ascii'));
			if (string === 'debian-binary') {
				return {
					ext: 'deb',
					mime: 'application/x-deb',
				};
			}

			return {
				ext: 'ar',
				mime: 'application/x-unix-archive',
			};
		}

		if (this.checkString('**ACE', {offset: 7})) {
			await tokenizer.peekBuffer(this.buffer, {length: 14, mayBeLess: true});
			if (this.checkString('**', {offset: 12})) {
				return {
					ext: 'ace',
					mime: 'application/x-ace-compressed',
				};
			}
		}

		// -- 8-byte signatures --

		if (this.check([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
			// APNG format (https://wiki.mozilla.org/APNG_Specification)
			// 1. Find the first IDAT (image data) chunk (49 44 41 54)
			// 2. Check if there is an "acTL" chunk before the IDAT one (61 63 54 4C)

			// Offset calculated as follows:
			// - 8 bytes: PNG signature
			// - 4 (length) + 4 (chunk type) + 13 (chunk data) + 4 (CRC): IHDR chunk

			await tokenizer.ignore(8); // ignore PNG signature

			async function readChunkHeader() {
				return {
					length: await tokenizer.readToken(INT32_BE),
					type: await tokenizer.readToken(new StringType(4, 'binary')),
				};
			}

			do {
				const chunk = await readChunkHeader();
				if (chunk.length < 0) {
					return; // Invalid chunk length
				}

				switch (chunk.type) {
					case 'IDAT':
						return {
							ext: 'png',
							mime: 'image/png',
						};
					case 'acTL':
						return {
							ext: 'apng',
							mime: 'image/apng',
						};
					default:
						await tokenizer.ignore(chunk.length + 4); // Ignore chunk-data + CRC
				}
			} while (tokenizer.position + 8 < tokenizer.fileInfo.size);

			return {
				ext: 'png',
				mime: 'image/png',
			};
		}

		if (this.check([0x41, 0x52, 0x52, 0x4F, 0x57, 0x31, 0x00, 0x00])) {
			return {
				ext: 'arrow',
				mime: 'application/x-apache-arrow',
			};
		}

		if (this.check([0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])) {
			return {
				ext: 'glb',
				mime: 'model/gltf-binary',
			};
		}

		// `mov` format variants
		if (
			this.check([0x66, 0x72, 0x65, 0x65], {offset: 4}) // `free`
			|| this.check([0x6D, 0x64, 0x61, 0x74], {offset: 4}) // `mdat` MJPEG
			|| this.check([0x6D, 0x6F, 0x6F, 0x76], {offset: 4}) // `moov`
			|| this.check([0x77, 0x69, 0x64, 0x65], {offset: 4}) // `wide`
		) {
			return {
				ext: 'mov',
				mime: 'video/quicktime',
			};
		}

		// -- 9-byte signatures --

		if (this.check([0x49, 0x49, 0x52, 0x4F, 0x08, 0x00, 0x00, 0x00, 0x18])) {
			return {
				ext: 'orf',
				mime: 'image/x-olympus-orf',
			};
		}

		if (this.checkString('gimp xcf ')) {
			return {
				ext: 'xcf',
				mime: 'image/x-xcf',
			};
		}

		// -- 12-byte signatures --

		if (this.check([0x49, 0x49, 0x55, 0x00, 0x18, 0x00, 0x00, 0x00, 0x88, 0xE7, 0x74, 0xD8])) {
			return {
				ext: 'rw2',
				mime: 'image/x-panasonic-rw2',
			};
		}

		// ASF_Header_Object first 80 bytes
		if (this.check([0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9])) {
			async function readHeader() {
				const guid = node_buffer.Buffer.alloc(16);
				await tokenizer.readBuffer(guid);
				return {
					id: guid,
					size: Number(await tokenizer.readToken(UINT64_LE)),
				};
			}

			await tokenizer.ignore(30);
			// Search for header should be in first 1KB of file.
			while (tokenizer.position + 24 < tokenizer.fileInfo.size) {
				const header = await readHeader();
				let payload = header.size - 24;
				if (_check(header.id, [0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11, 0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65])) {
					// Sync on Stream-Properties-Object (B7DC0791-A9B7-11CF-8EE6-00C00C205365)
					const typeId = node_buffer.Buffer.alloc(16);
					payload -= await tokenizer.readBuffer(typeId);

					if (_check(typeId, [0x40, 0x9E, 0x69, 0xF8, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found audio:
						return {
							ext: 'asf',
							mime: 'audio/x-ms-asf',
						};
					}

					if (_check(typeId, [0xC0, 0xEF, 0x19, 0xBC, 0x4D, 0x5B, 0xCF, 0x11, 0xA8, 0xFD, 0x00, 0x80, 0x5F, 0x5C, 0x44, 0x2B])) {
						// Found video:
						return {
							ext: 'asf',
							mime: 'video/x-ms-asf',
						};
					}

					break;
				}

				await tokenizer.ignore(payload);
			}

			// Default to ASF generic extension
			return {
				ext: 'asf',
				mime: 'application/vnd.ms-asf',
			};
		}

		if (this.check([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A])) {
			return {
				ext: 'ktx',
				mime: 'image/ktx',
			};
		}

		if ((this.check([0x7E, 0x10, 0x04]) || this.check([0x7E, 0x18, 0x04])) && this.check([0x30, 0x4D, 0x49, 0x45], {offset: 4})) {
			return {
				ext: 'mie',
				mime: 'application/x-mie',
			};
		}

		if (this.check([0x27, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], {offset: 2})) {
			return {
				ext: 'shp',
				mime: 'application/x-esri-shape',
			};
		}

		if (this.check([0xFF, 0x4F, 0xFF, 0x51])) {
			return {
				ext: 'j2c',
				mime: 'image/j2c',
			};
		}

		if (this.check([0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A])) {
			// JPEG-2000 family

			await tokenizer.ignore(20);
			const type = await tokenizer.readToken(new StringType(4, 'ascii'));
			switch (type) {
				case 'jp2 ':
					return {
						ext: 'jp2',
						mime: 'image/jp2',
					};
				case 'jpx ':
					return {
						ext: 'jpx',
						mime: 'image/jpx',
					};
				case 'jpm ':
					return {
						ext: 'jpm',
						mime: 'image/jpm',
					};
				case 'mjp2':
					return {
						ext: 'mj2',
						mime: 'image/mj2',
					};
				default:
					return;
			}
		}

		if (
			this.check([0xFF, 0x0A])
			|| this.check([0x00, 0x00, 0x00, 0x0C, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A])
		) {
			return {
				ext: 'jxl',
				mime: 'image/jxl',
			};
		}

		if (this.check([0xFE, 0xFF])) { // UTF-16-BOM-LE
			if (this.check([0, 60, 0, 63, 0, 120, 0, 109, 0, 108], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			return undefined; // Some unknown text based format
		}

		// -- Unsafe signatures --

		if (
			this.check([0x0, 0x0, 0x1, 0xBA])
			|| this.check([0x0, 0x0, 0x1, 0xB3])
		) {
			return {
				ext: 'mpg',
				mime: 'video/mpeg',
			};
		}

		if (this.check([0x00, 0x01, 0x00, 0x00, 0x00])) {
			return {
				ext: 'ttf',
				mime: 'font/ttf',
			};
		}

		if (this.check([0x00, 0x00, 0x01, 0x00])) {
			return {
				ext: 'ico',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0x00, 0x00, 0x02, 0x00])) {
			return {
				ext: 'cur',
				mime: 'image/x-icon',
			};
		}

		if (this.check([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) {
			// Detected Microsoft Compound File Binary File (MS-CFB) Format.
			return {
				ext: 'cfb',
				mime: 'application/x-cfb',
			};
		}

		// Increase sample size from 12 to 256.
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(256, tokenizer.fileInfo.size), mayBeLess: true});

		if (this.check([0x61, 0x63, 0x73, 0x70], {offset: 36})) {
			return {
				ext: 'icc',
				mime: 'application/vnd.iccprofile',
			};
		}

		// -- 15-byte signatures --

		if (this.checkString('BEGIN:')) {
			if (this.checkString('VCARD', {offset: 6})) {
				return {
					ext: 'vcf',
					mime: 'text/vcard',
				};
			}

			if (this.checkString('VCALENDAR', {offset: 6})) {
				return {
					ext: 'ics',
					mime: 'text/calendar',
				};
			}
		}

		// `raf` is here just to keep all the raw image detectors together.
		if (this.checkString('FUJIFILMCCD-RAW')) {
			return {
				ext: 'raf',
				mime: 'image/x-fujifilm-raf',
			};
		}

		if (this.checkString('Extended Module:')) {
			return {
				ext: 'xm',
				mime: 'audio/x-xm',
			};
		}

		if (this.checkString('Creative Voice File')) {
			return {
				ext: 'voc',
				mime: 'audio/x-voc',
			};
		}

		if (this.check([0x04, 0x00, 0x00, 0x00]) && this.buffer.length >= 16) { // Rough & quick check Pickle/ASAR
			const jsonSize = this.buffer.readUInt32LE(12);
			if (jsonSize > 12 && this.buffer.length >= jsonSize + 16) {
				try {
					const header = this.buffer.slice(16, jsonSize + 16).toString();
					const json = JSON.parse(header);
					// Check if Pickle is ASAR
					if (json.files) { // Final check, assuring Pickle/ASAR format
						return {
							ext: 'asar',
							mime: 'application/x-asar',
						};
					}
				} catch {}
			}
		}

		if (this.check([0x06, 0x0E, 0x2B, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0D, 0x01, 0x02, 0x01, 0x01, 0x02])) {
			return {
				ext: 'mxf',
				mime: 'application/mxf',
			};
		}

		if (this.checkString('SCRM', {offset: 44})) {
			return {
				ext: 's3m',
				mime: 'audio/x-s3m',
			};
		}

		// Raw MPEG-2 transport stream (188-byte packets)
		if (this.check([0x47]) && this.check([0x47], {offset: 188})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		// Blu-ray Disc Audio-Video (BDAV) MPEG-2 transport stream has 4-byte TP_extra_header before each 188-byte packet
		if (this.check([0x47], {offset: 4}) && this.check([0x47], {offset: 196})) {
			return {
				ext: 'mts',
				mime: 'video/mp2t',
			};
		}

		if (this.check([0x42, 0x4F, 0x4F, 0x4B, 0x4D, 0x4F, 0x42, 0x49], {offset: 60})) {
			return {
				ext: 'mobi',
				mime: 'application/x-mobipocket-ebook',
			};
		}

		if (this.check([0x44, 0x49, 0x43, 0x4D], {offset: 128})) {
			return {
				ext: 'dcm',
				mime: 'application/dicom',
			};
		}

		if (this.check([0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46])) {
			return {
				ext: 'lnk',
				mime: 'application/x.ms.shortcut', // Invented by us
			};
		}

		if (this.check([0x62, 0x6F, 0x6F, 0x6B, 0x00, 0x00, 0x00, 0x00, 0x6D, 0x61, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x00])) {
			return {
				ext: 'alias',
				mime: 'application/x.apple.alias', // Invented by us
			};
		}

		if (this.checkString('Kaydara FBX Binary  \u0000')) {
			return {
				ext: 'fbx',
				mime: 'application/x.autodesk.fbx', // Invented by us
			};
		}

		if (
			this.check([0x4C, 0x50], {offset: 34})
			&& (
				this.check([0x00, 0x00, 0x01], {offset: 8})
				|| this.check([0x01, 0x00, 0x02], {offset: 8})
				|| this.check([0x02, 0x00, 0x02], {offset: 8})
			)
		) {
			return {
				ext: 'eot',
				mime: 'application/vnd.ms-fontobject',
			};
		}

		if (this.check([0x06, 0x06, 0xED, 0xF5, 0xD8, 0x1D, 0x46, 0xE5, 0xBD, 0x31, 0xEF, 0xE7, 0xFE, 0x74, 0xB7, 0x1D])) {
			return {
				ext: 'indd',
				mime: 'application/x-indesign',
			};
		}

		// Increase sample size from 256 to 512
		await tokenizer.peekBuffer(this.buffer, {length: Math.min(512, tokenizer.fileInfo.size), mayBeLess: true});

		// Requires a buffer size of 512 bytes
		if (tarHeaderChecksumMatches(this.buffer)) {
			return {
				ext: 'tar',
				mime: 'application/x-tar',
			};
		}

		if (this.check([0xFF, 0xFE])) { // UTF-16-BOM-BE
			if (this.check([60, 0, 63, 0, 120, 0, 109, 0, 108, 0], {offset: 2})) {
				return {
					ext: 'xml',
					mime: 'application/xml',
				};
			}

			if (this.check([0xFF, 0x0E, 0x53, 0x00, 0x6B, 0x00, 0x65, 0x00, 0x74, 0x00, 0x63, 0x00, 0x68, 0x00, 0x55, 0x00, 0x70, 0x00, 0x20, 0x00, 0x4D, 0x00, 0x6F, 0x00, 0x64, 0x00, 0x65, 0x00, 0x6C, 0x00], {offset: 2})) {
				return {
					ext: 'skp',
					mime: 'application/vnd.sketchup.skp',
				};
			}

			return undefined; // Some text based format
		}

		if (this.checkString('-----BEGIN PGP MESSAGE-----')) {
			return {
				ext: 'pgp',
				mime: 'application/pgp-encrypted',
			};
		}

		// Check MPEG 1 or 2 Layer 3 header, or 'layer 0' for ADTS (MPEG sync-word 0xFFE)
		if (this.buffer.length >= 2 && this.check([0xFF, 0xE0], {offset: 0, mask: [0xFF, 0xE0]})) {
			if (this.check([0x10], {offset: 1, mask: [0x16]})) {
				// Check for (ADTS) MPEG-2
				if (this.check([0x08], {offset: 1, mask: [0x08]})) {
					return {
						ext: 'aac',
						mime: 'audio/aac',
					};
				}

				// Must be (ADTS) MPEG-4
				return {
					ext: 'aac',
					mime: 'audio/aac',
				};
			}

			// MPEG 1 or 2 Layer 3 header
			// Check for MPEG layer 3
			if (this.check([0x02], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp3',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 2
			if (this.check([0x04], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp2',
					mime: 'audio/mpeg',
				};
			}

			// Check for MPEG layer 1
			if (this.check([0x06], {offset: 1, mask: [0x06]})) {
				return {
					ext: 'mp1',
					mime: 'audio/mpeg',
				};
			}
		}
	}

	async readTiffTag(bigEndian) {
		const tagId = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		this.tokenizer.ignore(10);
		switch (tagId) {
			case 50_341:
				return {
					ext: 'arw',
					mime: 'image/x-sony-arw',
				};
			case 50_706:
				return {
					ext: 'dng',
					mime: 'image/x-adobe-dng',
				};
		}
	}

	async readTiffIFD(bigEndian) {
		const numberOfTags = await this.tokenizer.readToken(bigEndian ? UINT16_BE : UINT16_LE);
		for (let n = 0; n < numberOfTags; ++n) {
			const fileType = await this.readTiffTag(bigEndian);
			if (fileType) {
				return fileType;
			}
		}
	}

	async readTiffHeader(bigEndian) {
		const version = (bigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 2);
		const ifdOffset = (bigEndian ? UINT32_BE : UINT32_LE).get(this.buffer, 4);

		if (version === 42) {
			// TIFF file header
			if (ifdOffset >= 6) {
				if (this.checkString('CR', {offset: 8})) {
					return {
						ext: 'cr2',
						mime: 'image/x-canon-cr2',
					};
				}

				if (ifdOffset >= 8 && (this.check([0x1C, 0x00, 0xFE, 0x00], {offset: 8}) || this.check([0x1F, 0x00, 0x0B, 0x00], {offset: 8}))) {
					return {
						ext: 'nef',
						mime: 'image/x-nikon-nef',
					};
				}
			}

			await this.tokenizer.ignore(ifdOffset);
			const fileType = await this.readTiffIFD(bigEndian);
			return fileType ?? {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}

		if (version === 43) {	// Big TIFF file header
			return {
				ext: 'tif',
				mime: 'image/tiff',
			};
		}
	}
}

new Set(extensions);
new Set(mimeTypes);

const imageExtensions = new Set([
	'jpg',
	'png',
	'gif',
	'webp',
	'flif',
	'cr2',
	'tif',
	'bmp',
	'jxr',
	'psd',
	'ico',
	'bpg',
	'jp2',
	'jpm',
	'jpx',
	'heic',
	'cur',
	'dcm',
	'avif',
]);

async function imageType(input) {
	const result = await fileTypeFromBuffer(input);
	return imageExtensions.has(result?.ext) && result;
}

// العربية
var ar = {};

// čeština
var cz = {};

// Dansk
var da = {};

// Deutsch
var de = {};

// English
var en = {
    // setting.ts
    "Plugin Settings": "Plugin Settings",
    "Auto pasted upload": "Auto pasted upload",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)",
    "Default uploader": "Default uploader",
    "PicGo server": "PicGo server upload route",
    "PicGo server desc": "upload route, use PicList will be able to set picbed and config through query",
    "Please input PicGo server": "Please input upload route",
    "PicGo delete server": "PicGo server delete route(you need to use PicList app)",
    "PicList desc": "Search PicList on Github to download and install",
    "Please input PicGo delete server": "Please input delete server",
    "Delete image using PicList": "Delete image using PicList",
    "PicGo-Core path": "PicGo-Core path",
    "Delete successfully": "Delete successfully",
    "Delete failed": "Delete failed",
    "Image size suffix": "Image size suffix",
    "Image size suffix Description": "like |300 for resize image in ob.",
    "Please input image size suffix": "Please input image size suffix",
    "Error, could not delete": "Error, could not delete",
    "Please input PicGo-Core path, default using environment variables": "Please input PicGo-Core path, default using environment variables",
    "Work on network": "Work on network",
    "Work on network Description": "Allow upload network image by 'Upload all' command.\n Or when you paste, md standard image link in your clipboard will be auto upload.",
    "Upload when clipboard has image and text together": "Upload when clipboard has image and text together",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "When you copy, some application like Excel will image and text to clipboard, you can upload or not.",
    "Network Domain Black List": "Network Domain Black List",
    "Network Domain Black List Description": "Image in the domain list will not be upload,use comma separated",
    "Clipper image download folder": "Clipper image download folder",
    "Clipper image download folder Description": "Vault-relative temporary folder used before clipped network images are uploaded and removed.",
    "Auto process Web Clipper notes": "Auto process Web Clipper notes",
    "Auto process Web Clipper notes Description": "Watch the configured folder and automatically upload network images when Markdown notes are created or modified.",
    "Web Clipper watch folder": "Web Clipper watch folder",
    "Web Clipper watch folder Description": "Vault-relative folder to watch for clipped Markdown notes.",
    "Web Clipper process delay": "Web Clipper process delay",
    "Web Clipper process delay Description": "Debounce delay in milliseconds before processing a created or modified clipped note.",
    "Delete source file after you upload file": "Delete source file after you upload file",
    "Delete source file in ob assets after you upload file.": "Delete source file in ob assets after you upload file.",
    "Image desc": "Image desc",
    reserve: "default",
    "remove all": "none",
    "remove default": "remove image.png",
    "Remote server mode": "Remote server mode",
    "Remote server mode desc": "If you have deployed piclist-core or piclist on the server.",
    "Can not find image file": "Can not find image file",
    "File has been changedd, upload failure": "File has been changedd, upload failure",
    "File has been changedd, download failure": "File has been changedd, download failure",
    "Warning: upload files is different of reciver files from api": "Warning: upload files num is different of reciver files from api",
    upload: "Upload",
};

// British English
var enGB = {};

// Español
var es = {};

// français
var fr = {};

// हिन्दी
var hi = {};

// Bahasa Indonesia
var id = {};

// Italiano
var it = {};

// 日本語
var ja = {};

// 한국어
var ko = {};

// Nederlands
var nl = {};

// Norsk
var no = {};

// język polski
var pl = {};

// Português
var pt = {};

// Português do Brasil
// Brazilian Portuguese
var ptBR = {};

// Română
var ro = {};

// русский
var ru = {};

// Türkçe
var tr = {};

// 简体中文
var zhCN = {
    // setting.ts
    "Plugin Settings": "插件设置",
    "Auto pasted upload": "剪切板自动上传",
    "If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)": "启用该选项后，黏贴图片时会自动上传（你需要正确配置picgo）",
    "Default uploader": "默认上传器",
    "PicGo server": "PicGo server 上传接口",
    "PicGo server desc": "上传接口，使用PicList时可通过设置URL参数指定图床和配置",
    "Please input PicGo server": "请输入上传接口地址",
    "PicGo delete server": "PicGo server 删除接口(请使用PicList来启用此功能)",
    "PicList desc": "PicList是PicGo二次开发版，请Github搜索PicList下载",
    "Please input PicGo delete server": "请输入删除接口地址",
    "Delete image using PicList": "使用 PicList 删除图片",
    "PicGo-Core path": "PicGo-Core 路径",
    "Delete successfully": "删除成功",
    "Delete failed": "删除失败",
    "Error, could not delete": "错误，无法删除",
    "Image size suffix": "图片大小后缀",
    "Image size suffix Description": "比如：|300 用于调整图片大小",
    "Please input image size suffix": "请输入图片大小后缀",
    "Please input PicGo-Core path, default using environment variables": "请输入 PicGo-Core path，默认使用环境变量",
    "Work on network": "应用网络图片",
    "Work on network Description": "当你上传所有图片时，也会上传网络图片。以及当你进行黏贴时，剪切板中的标准 md 图片会被上传",
    "Upload when clipboard has image and text together": "当剪切板同时拥有文本和图片剪切板数据时是否上传图片",
    "When you copy, some application like Excel will image and text to clipboard, you can upload or not.": "当你复制时，某些应用例如 Excel 会在剪切板同时文本和图像数据，确认是否上传。",
    "Network Domain Black List": "网络图片域名黑名单",
    "Network Domain Black List Description": "黑名单域名中的图片将不会被上传，用英文逗号分割",
    "Clipper image download folder": "Clipper 网络图片临时下载目录",
    "Clipper image download folder Description": "vault 内的相对目录。Clipper 网络图片会先下载到这里，上传替换成功后再删除。",
    "Auto process Web Clipper notes": "自动处理 Web Clipper 笔记",
    "Auto process Web Clipper notes Description": "监听指定目录中新建或修改的 Markdown 笔记，并自动上传其中的网络图片。",
    "Web Clipper watch folder": "Web Clipper 监听目录",
    "Web Clipper watch folder Description": "vault 内的相对目录。默认监听 Clippings。",
    "Web Clipper process delay": "Web Clipper 处理延迟",
    "Web Clipper process delay Description": "文件新建或修改后延迟多少毫秒再处理，用于等待 Web Clipper 完成写入。",
    "Delete source file after you upload file": "上传文件后移除源文件",
    "Delete source file in ob assets after you upload file.": "上传文件后移除在ob附件文件夹中的文件",
    "Image desc": "图片描述",
    reserve: "默认",
    "remove all": "无",
    "remove default": "移除image.png",
    "Remote server mode": "远程服务器模式",
    "Remote server mode desc": "如果你在服务器部署了piclist-core或者piclist",
    "Can not find image file": "没有解析到图像文件",
    "File has been changedd, upload failure": "当前文件已变更，上传失败",
    "File has been changedd, download failure": "当前文件已变更，下载失败",
    "Warning: upload files is different of reciver files from api": "警告：上传的文件与接口返回的文件数量不一致",
    upload: "上传",
};

// 繁體中文
var zhTW = {};

const localeMap = {
    ar,
    cs: cz,
    da,
    de,
    en,
    'en-gb': enGB,
    es,
    fr,
    hi,
    id,
    it,
    ja,
    ko,
    nl,
    nn: no,
    pl,
    pt,
    'pt-br': ptBR,
    ro,
    ru,
    tr,
    'zh-cn': zhCN,
    'zh-tw': zhTW,
};
const locale = localeMap[obsidian.moment.locale()];
function t(str) {
    return (locale && locale[str]) || en[str];
}

async function downloadAllImageFiles(plugin) {
    const activeFile = plugin.app.workspace.getActiveFile();
    const folderPath = await plugin.app.fileManager.getAvailablePathForAttachment("");
    const fileArray = plugin.helper.getAllFiles();
    if (!(await plugin.app.vault.adapter.exists(folderPath))) {
        await plugin.app.vault.adapter.mkdir(folderPath);
    }
    let imageArray = [];
    for (const file of fileArray) {
        if (!file.path.startsWith("http")) {
            continue;
        }
        const url = file.path;
        const asset = getUrlAsset(url);
        let name = decodeURI(pathBrowserifyExports.parse(asset).name).replaceAll(/[\\\\/:*?\"<>|]/g, "-");
        const response = await download(plugin, url, folderPath, name);
        if (response.ok) {
            const activeFolder = plugin.app.workspace.getActiveFile().parent.path;
            imageArray.push({
                source: file.source,
                name: name,
                path: obsidian.normalizePath(pathBrowserifyExports.relative(obsidian.normalizePath(activeFolder), obsidian.normalizePath(response.path))),
            });
        }
    }
    let value = plugin.helper.getValue();
    imageArray.map(image => {
        let name = plugin.handleName(image.name);
        value = value.replace(image.source, `![${name}](${encodeURI(image.path)})`);
    });
    const currentFile = plugin.app.workspace.getActiveFile();
    if (activeFile.path !== currentFile.path) {
        new obsidian.Notice(t("File has been changedd, download failure"));
        return;
    }
    plugin.helper.setValue(value);
    new obsidian.Notice(`all: ${fileArray.length}\nsuccess: ${imageArray.length}\nfailed: ${fileArray.length - imageArray.length}`);
}
async function download(plugin, url, folderPath, name) {
    const response = await obsidian.requestUrl({ url });
    if (response.status !== 200) {
        return {
            ok: false,
            msg: "error",
        };
    }
    const type = await imageType(new Uint8Array(response.arrayBuffer));
    if (!type) {
        return {
            ok: false,
            msg: "error",
        };
    }
    try {
        let path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${name}.${type.ext}`));
        // 如果文件名已存在，则用随机值替换，不对文件后缀进行判断
        if (await plugin.app.vault.adapter.exists(path)) {
            path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${uuid()}.${type.ext}`));
        }
        plugin.app.vault.adapter.writeBinary(path, response.arrayBuffer);
        return {
            ok: true,
            msg: "ok",
            path: path,
            type,
        };
    }
    catch (err) {
        return {
            ok: false,
            msg: err,
        };
    }
}

/**
 * Selects only HTTP(S) images from a clipped Markdown document. This command is
 * intentionally independent from the existing `workOnNetWork` toggle because
 * users may want normal paste behavior unchanged while still post-processing
 * Web Clipper notes on demand.
 */
function filterClipperNetworkImages(imageList, blackDomains, relayedImageUrls = []) {
    // Uploaded image-host URLs are remembered after this plugin relays a source
    // image through PicGo/PicList. Skipping them prevents the Clippings watcher
    // from treating its own replacement write as a fresh network image to upload.
    const relayedUrlSet = new Set(relayedImageUrls);
    return imageList
        .filter(image => {
        // Malformed Markdown or unsupported regex branches can produce empty
        // paths; ignore them here so background processing never crashes the
        // plugin on a single bad image token.
        return typeof image.path === "string" && image.path.startsWith("http");
    })
        .filter(image => !relayedUrlSet.has(image.path))
        .filter(image => !isBlacklistedDomain(image.path, blackDomains));
}
/**
 * Replaces only images that have confirmed upload URLs. This is used for
 * automatic Clippings processing because PicGo can successfully upload part of
 * a batch while one image fails; successful images should still be written back
 * to the note instead of discarding the whole run.
 */
function buildPartiallyUploadedClipperMarkdown(markdown, uploadedImages, handleName) {
    let content = markdown;
    uploadedImages.forEach(image => {
        content = content.replaceAll(image.source, `![${handleName(image.name)}](${image.uploadUrl})`);
    });
    return content;
}
/**
 * Full Web Clipper post-processing flow:
 * 1. Find remote Markdown images in the active note.
 * 2. Download them into a configurable vault-relative temporary folder.
 * 3. Upload the downloaded files through the existing uploader.
 * 4. Replace the original remote URLs with uploaded URLs.
 * 5. Delete temporary local files only after replacement succeeds.
 */
async function uploadClipperNetworkImages(plugin) {
    const networkImages = filterClipperNetworkImages(plugin.helper.getAllFiles(), plugin.settings.newWorkBlackDomains, plugin.settings.relayedImageUrls);
    await uploadNetworkImages(plugin, networkImages);
}
/**
 * Uploads an explicit set of network images from the active note. Paste
 * handling uses this narrower entry point so it can process only the images
 * from the pasted Markdown instead of sweeping every remote image in the note.
 */
async function uploadNetworkImages(plugin, networkImages) {
    // Paste handlers may pass a pre-filtered list, while commands can pass raw
    // helper output. Re-filter here so every active-editor entry point shares the
    // same malformed-path, blacklist, and already-relayed URL behavior.
    networkImages = filterClipperNetworkImages(networkImages, plugin.settings.newWorkBlackDomains, plugin.settings.relayedImageUrls);
    const activeFile = plugin.app.workspace.getActiveFile();
    if (!activeFile) {
        new obsidian.Notice(t("Can not find image file"));
        return;
    }
    if (networkImages.length === 0) {
        new obsidian.Notice(t("Can not find image file"));
        return;
    }
    const folderPath = await getClipperDownloadFolder(plugin);
    await ensureVaultFolder(plugin, folderPath);
    const downloadedImages = [];
    for (const image of networkImages) {
        const result = await downloadClipperImage(plugin, image, folderPath);
        if (result.ok && result.image) {
            downloadedImages.push(result.image);
        }
        else {
            console.error("Failed to download clipped image", image.path, result.msg);
        }
    }
    if (downloadedImages.length === 0) {
        new obsidian.Notice(`all: ${networkImages.length}\nsuccess: 0\nfailed: ${networkImages.length}`);
        return;
    }
    const uploadedImages = await uploadDownloadedImages(plugin, downloadedImages);
    const currentFile = plugin.app.workspace.getActiveFile();
    if (!currentFile || activeFile.path !== currentFile.path) {
        await removeDownloadedImages(plugin, downloadedImages);
        new obsidian.Notice(t("File has been changedd, upload failure"));
        return;
    }
    const content = buildPartiallyUploadedClipperMarkdown(plugin.helper.getValue(), uploadedImages, name => plugin.handleName(name));
    try {
        plugin.helper.setValue(content);
        await removeDownloadedImages(plugin, downloadedImages);
    }
    catch (error) {
        new obsidian.Notice(error instanceof Error
            ? error.message
            : t("Warning: upload files is different of reciver files from api"));
        return;
    }
    new obsidian.Notice(`all: ${networkImages.length}\nsuccess: ${uploadedImages.length}\nfailed: ${networkImages.length - uploadedImages.length}`);
}
/**
 * Processes network images in a vault file without relying on the active
 * editor. The file is read again immediately before replacement so changes
 * made while images are downloading are preserved whenever the original image
 * sources are still present.
 */
async function uploadNetworkImagesInFile(plugin, file) {
    const initialContent = await plugin.app.vault.read(file);
    const networkImages = filterClipperNetworkImages(plugin.helper.getImageLink(initialContent), plugin.settings.newWorkBlackDomains, plugin.settings.relayedImageUrls);
    if (networkImages.length === 0) {
        return {
            total: 0,
            downloaded: 0,
            failed: 0,
            changed: false,
        };
    }
    const folderPath = await getClipperDownloadFolder(plugin);
    await ensureVaultFolder(plugin, folderPath);
    const downloadedImages = [];
    for (const image of networkImages) {
        const result = await downloadClipperImage(plugin, image, folderPath);
        if (result.ok && result.image) {
            downloadedImages.push(result.image);
        }
        else {
            console.error("Failed to download clipped image", image.path, result.msg);
        }
    }
    if (downloadedImages.length === 0) {
        return {
            total: networkImages.length,
            downloaded: 0,
            failed: networkImages.length,
            changed: false,
        };
    }
    const uploadedImages = await uploadDownloadedImages(plugin, downloadedImages);
    const latestContent = await plugin.app.vault.read(file);
    const content = buildPartiallyUploadedClipperMarkdown(latestContent, uploadedImages, name => plugin.handleName(name));
    if (content !== latestContent) {
        await plugin.app.vault.modify(file, content);
    }
    await removeDownloadedImages(plugin, downloadedImages);
    return {
        total: networkImages.length,
        downloaded: uploadedImages.length,
        failed: networkImages.length - uploadedImages.length,
        changed: content !== latestContent,
    };
}
function isBlacklistedDomain(src, blackDomains) {
    if (blackDomains.trim() === "") {
        return false;
    }
    const blackDomainList = blackDomains
        .split(",")
        .map(item => item.trim())
        .filter(item => item !== "");
    try {
        const domain = new URL(src).hostname;
        return blackDomainList.some(blackDomain => domain.includes(blackDomain));
    }
    catch {
        // Invalid URLs should not be blocked by the blacklist stage; the download
        // request will fail later and be counted as a failed image.
        return false;
    }
}
async function getClipperDownloadFolder(plugin) {
    const configuredFolder = plugin.settings.clipperImageDownloadFolder?.trim() || "";
    if (configuredFolder) {
        return obsidian.normalizePath(configuredFolder);
    }
    return plugin.app.fileManager.getAvailablePathForAttachment("");
}
async function ensureVaultFolder(plugin, folderPath) {
    const normalizedFolder = obsidian.normalizePath(folderPath).replace(/\/$/, "");
    if (!normalizedFolder) {
        return;
    }
    const parts = normalizedFolder.split("/");
    let current = "";
    for (const part of parts) {
        current = current ? obsidian.normalizePath(`${current}/${part}`) : part;
        if (!(await plugin.app.vault.adapter.exists(current))) {
            await plugin.app.vault.adapter.mkdir(current);
        }
    }
}
async function downloadClipperImage(plugin, image, folderPath) {
    try {
        const response = await obsidian.requestUrl({ url: image.path });
        if (response.status !== 200) {
            return {
                ok: false,
                msg: response.status,
            };
        }
        const type = await imageType(new Uint8Array(response.arrayBuffer));
        if (!type) {
            return {
                ok: false,
                msg: "unknown image type",
            };
        }
        const fileName = getSafeClipperFileName(image);
        const tempFileName = buildUniqueClipperTempName(image);
        const localPath = await getUniqueLocalImagePath(plugin, folderPath, tempFileName, type.ext);
        await plugin.app.vault.adapter.writeBinary(localPath, response.arrayBuffer);
        return {
            ok: true,
            image: {
                source: image.source,
                name: image.name || fileName,
                localPath,
            },
        };
    }
    catch (error) {
        return {
            ok: false,
            msg: error,
        };
    }
}
function getSafeClipperFileName(image) {
    const asset = getUrlAsset(image.path);
    const parsedName = pathBrowserifyExports.parse(asset).name || image.name || uuid();
    return decodeURI(parsedName).replaceAll(/[\\\\/:*?\"<>|]/g, "-");
}
/**
 * Creates a unique vault-local temporary file base name for clipped images.
 * The prefix matters for image hosts such as Gitee that reject uploads when
 * PicGo reuses the original URL file name from a previous clipping test.
 */
function buildUniqueClipperTempName(image, uniqueId = uuid()) {
    return `${uniqueId}-${getSafeClipperFileName(image)}`;
}
async function getUniqueLocalImagePath(plugin, folderPath, name, extension) {
    let path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${name}.${extension}`));
    if (!(await plugin.app.vault.adapter.exists(path))) {
        return path;
    }
    path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${uuid()}.${extension}`));
    while (await plugin.app.vault.adapter.exists(path)) {
        path = obsidian.normalizePath(pathBrowserifyExports.join(folderPath, `${uuid()}.${extension}`));
    }
    return path;
}
function getAbsoluteVaultPath(plugin, vaultRelativePath) {
    const basePath = plugin.app.vault.adapter.getBasePath();
    return obsidian.normalizePath(pathBrowserifyExports.join(basePath, vaultRelativePath));
}
async function removeDownloadedImages(plugin, downloadedImages) {
    for (const image of downloadedImages) {
        if (await plugin.app.vault.adapter.exists(image.localPath)) {
            await plugin.app.vault.adapter.remove(image.localPath);
        }
    }
}
async function uploadDownloadedImages(plugin, downloadedImages) {
    const uploadedImages = [];
    for (const image of downloadedImages) {
        try {
            // Upload one downloaded file at a time so a failed image host request does
            // not shift URL ordering or prevent already-successful images from being
            // replaced in the Markdown file.
            const uploadResult = await plugin.upload([
                getAbsoluteVaultPath(plugin, image.localPath),
            ]);
            const uploadUrl = uploadResult.result[0];
            if (uploadUrl) {
                uploadedImages.push({
                    ...image,
                    uploadUrl,
                });
            }
        }
        catch (error) {
            console.error("Failed to upload clipped image", image.localPath, error);
        }
    }
    await rememberRelayedImageUrls(plugin, uploadedImages.map(image => image.uploadUrl));
    return uploadedImages;
}
/**
 * Persists image-host URLs produced by the relay flow. The list is capped so a
 * long-running vault does not grow plugin data without bound, while still
 * keeping enough recent replacements to suppress watcher re-upload loops.
 */
async function rememberRelayedImageUrls(plugin, uploadUrls, maxStoredUrls = 1000) {
    const urls = uploadUrls.filter(url => typeof url === "string" && url !== "");
    if (urls.length === 0) {
        return;
    }
    const nextUrls = [...(plugin.settings.relayedImageUrls || []), ...urls];
    plugin.settings.relayedImageUrls = Array.from(new Set(nextUrls)).slice(-maxStoredUrls);
    await plugin.saveSettings();
}

/**
 * Checks whether a vault-relative path should trigger automatic Web Clipper
 * image processing. The folder match is strict so a folder like `MyClippings`
 * will not accidentally match the configured `Clippings` directory.
 */
function isWatchedMarkdownPath(path, folder) {
    const normalizedPath = obsidian.normalizePath(path);
    const normalizedFolder = obsidian.normalizePath(folder.trim()).replace(/\/$/, "");
    if (!normalizedPath.toLowerCase().endsWith(".md")) {
        return false;
    }
    if (!normalizedFolder) {
        return true;
    }
    return normalizedPath.startsWith(`${normalizedFolder}/`);
}

/**
 * Converts a browser/Electron file picker result into absolute image paths that
 * PicGo and PicGo-Core can upload. Obsidian runs on Electron desktop, so image
 * files selected outside the vault may expose either `file.path` or require the
 * Electron `webUtils.getPathForFile` fallback depending on the Electron version.
 */
function collectLocalImageFiles(fileList, resolveFallbackPath = () => "") {
    return Array.from(fileList)
        .filter(file => {
        // Some OS file pickers provide an empty MIME type, so fall back to the
        // selected file name extension before rejecting a local image.
        return file.type.startsWith("image/") || isAssetTypeAnImage(file.name);
    })
        .map(file => {
        const pickerFile = file;
        const path = pickerFile.path || resolveFallbackPath(file);
        return {
            name: file.name,
            path,
        };
    })
        .filter(item => item.path);
}

const randomString = (length) => Array(length + 1)
    .join((Math.random().toString(36) + "00000000000000000").slice(2, 18))
    .slice(0, length);
async function payloadGenerator(payload_data) {
    const boundary_string = `Boundary${randomString(16)}`;
    const boundary = `------${boundary_string}`;
    // Keep payload chunks as BlobPart values instead of encoded Uint8Array
    // instances so newer TypeScript DOM typings do not reject ArrayBufferLike
    // views while assembling multipart upload bodies.
    const chunks = [];
    for (const [key, values] of Object.entries(payload_data)) {
        for (const value of Array.isArray(values) ? values : [values]) {
            chunks.push(`${boundary}\r\n`);
            if (typeof value === "string") {
                chunks.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`);
            }
            else if (value instanceof File) {
                chunks.push(`Content-Disposition: form-data; name="${key}"; filename="${value.name}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`);
                chunks.push(await obsidian.getBlobArrayBuffer(value));
                chunks.push("\r\n");
            }
            else if (value instanceof Blob) {
                chunks.push(`Content-Disposition: form-data; name="${key}"; filename="blob"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`);
                chunks.push(await value.arrayBuffer());
                chunks.push("\r\n");
            }
            else {
                chunks.push(await new Response(value).arrayBuffer());
                chunks.push("\r\n");
            }
        }
    }
    chunks.push(`${boundary}--\r\n`);
    const payload = new Blob(chunks, {
        type: "multipart/form-data; boundary=" + boundary_string,
    });
    return [await payload.arrayBuffer(), boundary_string];
}

class PicGoUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        let response;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                if (typeof fileList[i] === "string") {
                    const { readFile } = require("fs");
                    const file = fileList[i];
                    const buffer = await new Promise((resolve, reject) => {
                        readFile(file, (err, data) => {
                            if (err) {
                                reject(err);
                            }
                            resolve(data);
                        });
                    });
                    const arrayBuffer = bufferToArrayBuffer(buffer);
                    files.push(new File([arrayBuffer], file));
                }
                else {
                    const timestamp = new Date().getTime();
                    const image = fileList[i];
                    if (!image.file)
                        continue;
                    const arrayBuffer = await this.plugin.app.vault.adapter.readBinary(image.file.path);
                    files.push(new File([arrayBuffer], timestamp + pathBrowserifyExports.extname(image.file.path)));
                }
            }
            response = await this.uploadFileByData(files);
        }
        else {
            const basePath = this.plugin.app.vault.adapter.getBasePath();
            const list = fileList.map(item => {
                if (typeof item === "string") {
                    return item;
                }
                else if (item.path.startsWith("http")) {
                    // Network images are valid PicGo server inputs. Joining them with the
                    // vault base path turns `https://...` into an unreadable local path
                    // such as `/vault/https:/...`, which makes pasted Markdown links and
                    // clipped notes fail before PicGo can download them.
                    return item.path;
                }
                else {
                    return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
                }
            });
            response = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ list: list }),
            });
        }
        return this.handleResponse(response);
    }
    async uploadFileByData(fileList) {
        const payload_data = {
            list: [],
        };
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            payload_data["list"].push(file);
        }
        const [request_body, boundary_string] = await payloadGenerator(payload_data);
        const options = {
            method: "POST",
            url: this.settings.uploadServer,
            contentType: `multipart/form-data; boundary=----${boundary_string}`,
            body: request_body,
        };
        const response = await obsidian.requestUrl(options);
        return response;
    }
    async uploadFileByClipboard(fileList) {
        let res;
        if (this.settings.remoteServerMode) {
            const files = [];
            for (let i = 0; i < fileList.length; i++) {
                const timestamp = new Date().getTime();
                const file = fileList[i];
                const arrayBuffer = await file.arrayBuffer();
                files.push(new File([arrayBuffer], timestamp + ".png"));
            }
            res = await this.uploadFileByData(files);
        }
        else {
            res = await obsidian.requestUrl({
                url: this.settings.uploadServer,
                method: "POST",
            });
        }
        return this.handleResponse(res);
    }
    /**
     * 处理返回值
     */
    async handleResponse(response) {
        const data = (await response.json);
        if (response.status !== 200) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        if (data.success === false) {
            console.error(response, data);
            return {
                success: false,
                msg: data.msg || data.message,
                result: [],
            };
        }
        // piclist
        if (data.fullResult) {
            const uploadUrlFullResultList = data.fullResult || [];
            this.settings.uploadedImages = [
                ...(this.settings.uploadedImages || []),
                ...uploadUrlFullResultList,
            ];
            this.plugin.saveSettings();
        }
        return {
            success: true,
            msg: "success",
            result: typeof data.result == "string" ? [data.result] : data.result,
        };
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        return this.uploadFileByClipboard(fileList);
    }
}

class PicGoCoreUploader {
    settings;
    plugin;
    constructor(plugin) {
        this.settings = plugin.settings;
        this.plugin = plugin;
    }
    async uploadFiles(fileList) {
        const basePath = this.plugin.app.vault.adapter.getBasePath();
        const list = fileList.map(item => {
            if (typeof item === "string") {
                return item;
            }
            else {
                return obsidian.normalizePath(pathBrowserifyExports.join(basePath, item.path));
            }
        });
        const length = list.length;
        let cli = this.settings.picgoCorePath || "picgo";
        let command = `${cli} upload ${list.map(item => `"${item}"`).join(" ")}`;
        const res = await this.exec(command);
        const splitList = res.split("\n");
        const splitListLength = splitList.length;
        const data = splitList.splice(splitListLength - 1 - length, length);
        if (res.includes("PicGo ERROR")) {
            console.log(command, res);
            return {
                success: false,
                msg: "失败",
                result: [],
            };
        }
        else {
            return {
                success: true,
                result: data,
            };
        }
    }
    // PicGo-Core 上传处理
    async uploadFileByClipboard() {
        const res = await this.uploadByClip();
        const splitList = res.split("\n");
        const lastImage = getLastImage(splitList);
        if (lastImage) {
            return {
                success: true,
                msg: "success",
                result: [lastImage],
            };
        }
        else {
            console.log(splitList);
            return {
                success: false,
                msg: `"Please check PicGo-Core config"\n${res}`,
                result: [],
            };
        }
    }
    // PicGo-Core的剪切上传反馈
    async uploadByClip() {
        let command;
        if (this.settings.picgoCorePath) {
            command = `${this.settings.picgoCorePath} upload`;
        }
        else {
            command = `picgo upload`;
        }
        const res = await this.exec(command);
        return res;
    }
    async exec(command) {
        const { exec } = require("child_process");
        let { stdout } = await exec(command);
        const res = await streamToString(stdout);
        return res;
    }
    async spawnChild() {
        const { spawn } = require("child_process");
        const child = spawn("picgo", ["upload"], {
            shell: true,
        });
        let data = "";
        for await (const chunk of child.stdout) {
            data += chunk;
        }
        let error = "";
        for await (const chunk of child.stderr) {
            error += chunk;
        }
        const exitCode = await new Promise((resolve, reject) => {
            child.on("close", resolve);
        });
        if (exitCode) {
            throw new Error(`subprocess error exit ${exitCode}, ${error}`);
        }
        return data;
    }
    async upload(fileList) {
        return this.uploadFiles(fileList);
    }
    async uploadByClipboard(fileList) {
        console.log("uploadByClipboard", fileList);
        return this.uploadFileByClipboard();
    }
}

function getUploader(uploader) {
    switch (uploader) {
        case "PicGo":
            return PicGoUploader;
        case "PicGo-Core":
            return PicGoCoreUploader;
        default:
            throw new Error("Invalid uploader");
    }
}
class UploaderManager {
    uploader;
    plugin;
    constructor(uploader, plugin) {
        this.plugin = plugin;
        const Uploader = getUploader(uploader);
        this.uploader = new Uploader(this.plugin);
    }
    async upload(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.upload(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
    async uploadByClipboard(fileList) {
        if (obsidian.Platform.isMobileApp && !this.plugin.settings.remoteServerMode) {
            new obsidian.Notice("Mobile App must use remote server mode.");
            throw new Error("Mobile App must use remote server mode.");
        }
        const res = await this.uploader.uploadByClipboard(fileList);
        if (!res.success) {
            new obsidian.Notice(res.msg || "Upload Failed");
            throw new Error(res.msg || "Upload Failed");
        }
        return res;
    }
}

class PicGoDeleter {
    plugin;
    constructor(plugin) {
        this.plugin = plugin;
    }
    async deleteImage(configMap) {
        const response = await obsidian.requestUrl({
            url: this.plugin.settings.deleteServer,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                list: configMap,
            }),
        });
        const data = response.json;
        return data;
    }
}

// ![](./dsa/aa.png) local image should has ext, support ![](<./dsa/aa.png>), support ![](image.png "alt")
// ![](https://dasdasda) internet image should not has ext
const REGEX_FILE = /\!\[(.*?)\]\(<(\S+\.\w+)>\)|\!\[(.*?)\]\((\S+\.\w+)(?:\s+"[^"]*")?\)|\!\[(.*?)\]\((https?:\/\/.*?)\)/g;
const REGEX_WIKI_FILE = /\!\[\[(.*?)(\s*?\|.*?)?\]\]/g;
class Helper {
    app;
    constructor(app) {
        this.app = app;
    }
    getFrontmatterValue(key, defaultValue = undefined) {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            return undefined;
        }
        const path = file.path;
        const cache = this.app.metadataCache.getCache(path);
        let value = defaultValue;
        if (cache?.frontmatter && cache.frontmatter.hasOwnProperty(key)) {
            value = cache.frontmatter[key];
        }
        return value;
    }
    getEditor() {
        const mdView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (mdView) {
            return mdView.editor;
        }
        else {
            return null;
        }
    }
    getValue() {
        const editor = this.getEditor();
        return editor.getValue();
    }
    setValue(value) {
        const editor = this.getEditor();
        const { left, top } = editor.getScrollInfo();
        const position = editor.getCursor();
        editor.setValue(value);
        editor.scrollTo(left, top);
        editor.setCursor(position);
    }
    // get all file urls, include local and internet
    getAllFiles() {
        const editor = this.getEditor();
        let value = editor.getValue();
        return this.getImageLink(value);
    }
    getImageLink(value) {
        const matches = value.matchAll(REGEX_FILE);
        const WikiMatches = value.matchAll(REGEX_WIKI_FILE);
        let fileArray = [];
        for (const match of matches) {
            const source = match[0];
            const name = match[1] ?? match[3] ?? match[5] ?? "";
            const path = cleanMarkdownImagePath(match[2] ?? match[4] ?? match[6]);
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        for (const match of WikiMatches) {
            let name = pathBrowserifyExports.parse(match[1]).name;
            const path = match[1];
            const source = match[0];
            if (match[2]) {
                name = `${name}${match[2]}`;
            }
            fileArray.push({
                path: path,
                name: name,
                source: source,
            });
        }
        return fileArray;
    }
    hasBlackDomain(src, blackDomains) {
        if (blackDomains.trim() === "") {
            return false;
        }
        const blackDomainList = blackDomains.split(",").filter(item => item !== "");
        let url = new URL(src);
        const domain = url.hostname;
        return blackDomainList.some(blackDomain => domain.includes(blackDomain));
    }
}
/**
 * Normalizes the path captured from a Markdown image. Web Clipper often emits
 * extensionless URLs or URLs with an optional title, which fall into the regex
 * branch using groups 5/6; without this cleanup those images can produce an
 * undefined path and crash later network filtering.
 */
function cleanMarkdownImagePath(path) {
    if (!path) {
        return "";
    }
    const titleMatch = path.match(/^(\S+)(?:\s+"[^"]*")$/);
    return titleMatch ? titleMatch[1] : path;
}

const DEFAULT_SETTINGS = {
    uploadByClipSwitch: false,
    uploader: "PicGo",
    uploadServer: "http://127.0.0.1:36677/upload",
    deleteServer: "http://127.0.0.1:36677/delete",
    imageSizeSuffix: "",
    picgoCorePath: "",
    workOnNetWork: false,
    applyImage: true,
    newWorkBlackDomains: "",
    deleteSource: false,
    imageDesc: "origin",
    remoteServerMode: false,
    clipperImageDownloadFolder: "image-auto-upload-temp",
    autoProcessClippings: true,
    clipperAutoProcessFolder: "Clippings",
    clipperAutoProcessDelayMs: 1500,
    relayedImageUrls: [],
};
class SettingTab extends obsidian.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: t("Plugin Settings") });
        new obsidian.Setting(containerEl)
            .setName(t("Auto pasted upload"))
            .setDesc(t("If you set this value true, when you paste image, it will be auto uploaded(you should set the picGo server rightly)"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.uploadByClipSwitch)
            .onChange(async (value) => {
            this.plugin.settings.uploadByClipSwitch = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Default uploader"))
            .setDesc(t("Default uploader"))
            .addDropdown(cb => cb
            .addOption("PicGo", "PicGo(app)")
            .addOption("PicGo-Core", "PicGo-Core")
            .setValue(this.plugin.settings.uploader)
            .onChange(async (value) => {
            this.plugin.settings.uploader = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo server"))
                .setDesc(t("PicGo server desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo server"))
                .setValue(this.plugin.settings.uploadServer)
                .onChange(async (key) => {
                this.plugin.settings.uploadServer = key;
                await this.plugin.saveSettings();
            }));
            new obsidian.Setting(containerEl)
                .setName(t("PicGo delete server"))
                .setDesc(t("PicList desc"))
                .addText(text => text
                .setPlaceholder(t("Please input PicGo delete server"))
                .setValue(this.plugin.settings.deleteServer)
                .onChange(async (key) => {
                this.plugin.settings.deleteServer = key;
                await this.plugin.saveSettings();
            }));
        }
        new obsidian.Setting(containerEl)
            .setName(t("Remote server mode"))
            .setDesc(t("Remote server mode desc"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.remoteServerMode)
            .onChange(async (value) => {
            this.plugin.settings.remoteServerMode = value;
            if (value) {
                this.plugin.settings.workOnNetWork = false;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        if (this.plugin.settings.uploader === "PicGo-Core") {
            new obsidian.Setting(containerEl)
                .setName(t("PicGo-Core path"))
                .setDesc(t("Please input PicGo-Core path, default using environment variables"))
                .addText(text => text
                .setPlaceholder("")
                .setValue(this.plugin.settings.picgoCorePath)
                .onChange(async (value) => {
                this.plugin.settings.picgoCorePath = value;
                await this.plugin.saveSettings();
            }));
        }
        // image desc setting
        new obsidian.Setting(containerEl)
            .setName(t("Image desc"))
            .setDesc(t("Image desc"))
            .addDropdown(cb => cb
            .addOption("origin", t("reserve")) // 保留全部
            .addOption("none", t("remove all")) // 移除全部
            .addOption("removeDefault", t("remove default")) // 只移除默认即 image.png
            .setValue(this.plugin.settings.imageDesc)
            .onChange(async (value) => {
            this.plugin.settings.imageDesc = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Image size suffix"))
            .setDesc(t("Image size suffix Description"))
            .addText(text => text
            .setPlaceholder(t("Please input image size suffix"))
            .setValue(this.plugin.settings.imageSizeSuffix)
            .onChange(async (key) => {
            this.plugin.settings.imageSizeSuffix = key;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Work on network"))
            .setDesc(t("Work on network Description"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.workOnNetWork)
            .onChange(async (value) => {
            if (this.plugin.settings.remoteServerMode) {
                new obsidian.Notice("Can only work when remote server mode is off.");
                this.plugin.settings.workOnNetWork = false;
            }
            else {
                this.plugin.settings.workOnNetWork = value;
            }
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Network Domain Black List"))
            .setDesc(t("Network Domain Black List Description"))
            .addTextArea(textArea => textArea
            .setValue(this.plugin.settings.newWorkBlackDomains)
            .onChange(async (value) => {
            this.plugin.settings.newWorkBlackDomains = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Clipper image download folder"))
            .setDesc(t("Clipper image download folder Description"))
            .addText(text => text
            .setPlaceholder("image-auto-upload-temp")
            .setValue(this.plugin.settings.clipperImageDownloadFolder)
            .onChange(async (value) => {
            // The folder is vault-relative because downloaded clipper images
            // must be visible to Obsidian's adapter before they can be uploaded
            // and safely removed after successful replacement.
            this.plugin.settings.clipperImageDownloadFolder = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Auto process Web Clipper notes"))
            .setDesc(t("Auto process Web Clipper notes Description"))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.autoProcessClippings)
            .onChange(async (value) => {
            // This switch controls only background Web Clipper file watching;
            // manual commands and paste/drop upload behavior remain independent.
            this.plugin.settings.autoProcessClippings = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Web Clipper watch folder"))
            .setDesc(t("Web Clipper watch folder Description"))
            .addText(text => text
            .setPlaceholder("Clippings")
            .setValue(this.plugin.settings.clipperAutoProcessFolder)
            .onChange(async (value) => {
            // The folder is vault-relative and intentionally scoped so the
            // plugin does not scan unrelated notes throughout the vault.
            this.plugin.settings.clipperAutoProcessFolder = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Web Clipper process delay"))
            .setDesc(t("Web Clipper process delay Description"))
            .addText(text => text
            .setPlaceholder("1500")
            .setValue(String(this.plugin.settings.clipperAutoProcessDelayMs))
            .onChange(async (value) => {
            // Debounce delay gives Web Clipper time to finish multi-step writes
            // before the image relay reads and rewrites the note.
            this.plugin.settings.clipperAutoProcessDelayMs =
                Number(value) || 1500;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Upload when clipboard has image and text together"))
            .setDesc(t("When you copy, some application like Excel will image and text to clipboard, you can upload or not."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.applyImage)
            .onChange(async (value) => {
            this.plugin.settings.applyImage = value;
            this.display();
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName(t("Delete source file after you upload file"))
            .setDesc(t("Delete source file in ob assets after you upload file."))
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.deleteSource)
            .onChange(async (value) => {
            this.plugin.settings.deleteSource = value;
            this.display();
            await this.plugin.saveSettings();
        }));
    }
}

class imageAutoUploadPlugin extends obsidian.Plugin {
    settings = DEFAULT_SETTINGS;
    helper;
    editor;
    picGoDeleter;
    clipperAutoProcessTimers = new Map();
    clipperAutoProcessingFiles = new Set();
    async loadSettings() {
        this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    onunload() {
        this.clipperAutoProcessTimers.forEach(timer => window.clearTimeout(timer));
        this.clipperAutoProcessTimers.clear();
    }
    async onload() {
        await this.loadSettings();
        this.helper = new Helper(this.app);
        this.picGoDeleter = new PicGoDeleter(this);
        obsidian.addIcon("upload", `<svg t="1636630783429" class="icon" viewBox="0 0 100 100" version="1.1" p-id="4649" xmlns="http://www.w3.org/2000/svg">
      <path d="M 71.638 35.336 L 79.408 35.336 C 83.7 35.336 87.178 38.662 87.178 42.765 L 87.178 84.864 C 87.178 88.969 83.7 92.295 79.408 92.295 L 17.249 92.295 C 12.957 92.295 9.479 88.969 9.479 84.864 L 9.479 42.765 C 9.479 38.662 12.957 35.336 17.249 35.336 L 25.019 35.336 L 25.019 42.765 L 17.249 42.765 L 17.249 84.864 L 79.408 84.864 L 79.408 42.765 L 71.638 42.765 L 71.638 35.336 Z M 49.014 10.179 L 67.326 27.688 L 61.835 32.942 L 52.849 24.352 L 52.849 59.731 L 45.078 59.731 L 45.078 24.455 L 36.194 32.947 L 30.702 27.692 L 49.012 10.181 Z" p-id="4650" fill="#8a8a8a"></path>
    </svg>`);
        this.addSettingTab(new SettingTab(this.app, this));
        this.addCommand({
            id: "image-auto-upload-pro-upload-all-images",
            name: "Image Auto Upload Pro: Upload all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        this.uploadAllFile();
                    }
                    return true;
                }
                return false;
            },
        });
        this.addCommand({
            id: "image-auto-upload-pro-download-all-images",
            name: "Image Auto Upload Pro: Download all images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        downloadAllImageFiles(this);
                    }
                    return true;
                }
                return false;
            },
        });
        this.addCommand({
            id: "image-auto-upload-pro-upload-local-images-from-file-picker",
            name: "Image Auto Upload Pro: Upload local images from file picker",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        this.uploadLocalImagesFromPicker();
                    }
                    return true;
                }
                return false;
            },
        });
        this.addCommand({
            id: "image-auto-upload-pro-upload-clipped-network-images",
            name: "Image Auto Upload Pro: Download, upload, and cleanup clipped network images",
            checkCallback: (checking) => {
                let leaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (leaf) {
                    if (!checking) {
                        uploadClipperNetworkImages(this).catch(error => {
                            // Keep command-triggered async failures visible to the user
                            // instead of letting Obsidian surface an unhandled promise.
                            new obsidian.Notice(error instanceof Error ? error.message : "Upload error");
                        });
                    }
                    return true;
                }
                return false;
            },
        });
        this.setupPasteHandler();
        this.registerFileMenu();
        this.registerSelection();
        this.registerClippingsAutoProcessor();
    }
    /**
     * 获取当前使用的上传器
     */
    getUploader() {
        const uploader = new UploaderManager(this.settings.uploader, this);
        return uploader;
    }
    /**
     * 上传图片
     */
    upload(images) {
        let uploader = this.getUploader();
        return uploader.upload(images);
    }
    /**
     * 通过剪贴板上传图片
     */
    uploadByClipboard(fileList) {
        let uploader = this.getUploader();
        return uploader.uploadByClipboard(fileList);
    }
    /**
     * Watches the configured Web Clipper folder for new or changed Markdown
     * files. The debounced schedule is important because Web Clipper may create a
     * file and then write its body in multiple modify events.
     */
    registerClippingsAutoProcessor() {
        this.registerEvent(this.app.vault.on("create", file => {
            this.scheduleClippingAutoProcess(file);
        }));
        this.registerEvent(this.app.vault.on("modify", file => {
            this.scheduleClippingAutoProcess(file);
        }));
    }
    /**
     * Schedules background processing for a watched Markdown file while avoiding
     * duplicate uploads during rapid successive writes and while a previous
     * processing run for the same file is still active.
     */
    scheduleClippingAutoProcess(file) {
        if (!this.settings.autoProcessClippings) {
            return;
        }
        if (!(file instanceof obsidian.TFile)) {
            return;
        }
        if (!isWatchedMarkdownPath(file.path, this.settings.clipperAutoProcessFolder)) {
            return;
        }
        if (this.clipperAutoProcessingFiles.has(file.path)) {
            return;
        }
        const existingTimer = this.clipperAutoProcessTimers.get(file.path);
        if (existingTimer) {
            window.clearTimeout(existingTimer);
        }
        const delay = Number(this.settings.clipperAutoProcessDelayMs) || 1500;
        const timer = window.setTimeout(() => {
            this.clipperAutoProcessTimers.delete(file.path);
            this.processClippingFile(file).catch(error => {
                new obsidian.Notice(error instanceof Error ? error.message : "Upload error");
            });
        }, delay);
        this.clipperAutoProcessTimers.set(file.path, timer);
    }
    /**
     * Runs the download-upload-replace-cleanup pipeline for a single clipped
     * Markdown file. The processing set suppresses modify events caused by our own
     * replacement write so the plugin does not immediately reprocess the file.
     */
    async processClippingFile(file) {
        if (this.clipperAutoProcessingFiles.has(file.path)) {
            return;
        }
        this.clipperAutoProcessingFiles.add(file.path);
        try {
            const result = await uploadNetworkImagesInFile(this, file);
            if (result.changed) {
                new obsidian.Notice(`Image Auto Upload Pro: processed ${result.downloaded}/${result.total} images`);
            }
        }
        finally {
            this.clipperAutoProcessingFiles.delete(file.path);
        }
    }
    /**
     * Opens the native file picker and uploads selected image files that may live
     * outside the current vault. The command inserts uploaded Markdown links at
     * the active editor cursor, so users can add local screenshots/files without
     * copying them into the clipboard first.
     */
    uploadLocalImagesFromPicker() {
        const editor = this.helper.getEditor();
        if (!editor) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.multiple = true;
        input.style.display = "none";
        input.addEventListener("change", async () => {
            try {
                const images = collectLocalImageFiles(input.files || [], file => this.getElectronFilePath(file));
                if (images.length === 0) {
                    new obsidian.Notice(t("Can not find image file"));
                    return;
                }
                const result = await this.upload(images.map(image => image.path));
                this.insertUploadedLocalImages(images, result.result);
            }
            catch (error) {
                new obsidian.Notice(error instanceof Error ? error.message : "Upload error");
            }
            finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    }
    /**
     * Resolves the absolute path from an Electron-backed File object. Newer
     * Electron versions hide `file.path`, so `webUtils.getPathForFile` is the
     * compatibility fallback used by Obsidian desktop and the existing drop flow.
     */
    getElectronFilePath(file) {
        const fileWithPath = file;
        if (fileWithPath.path) {
            return fileWithPath.path;
        }
        try {
            const { webUtils } = require("electron");
            return webUtils.getPathForFile(file);
        }
        catch {
            return "";
        }
    }
    /**
     * Inserts uploaded URLs in the same order PicGo/PicList returned them. The
     * count check protects the editor from receiving mismatched image captions
     * when an upload server accepts only part of a multi-file selection.
     */
    insertUploadedLocalImages(images, uploadUrlList) {
        if (images.length !== uploadUrlList.length) {
            new obsidian.Notice(t("Warning: upload files is different of reciver files from api"));
            return;
        }
        const editor = this.helper.getEditor();
        if (!editor) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        const markdown = images
            .map((image, index) => {
            return `![${this.handleName(image.name)}](${uploadUrlList[index]})`;
        })
            .join("\n");
        editor.replaceSelection(`${markdown}\n`);
    }
    registerSelection() {
        this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
            if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
                return;
            }
            const selection = editor.getSelection();
            if (selection) {
                const markdownRegex = /!\[.*\]\((.*)\)/g;
                const markdownMatch = markdownRegex.exec(selection);
                if (markdownMatch && markdownMatch.length > 1) {
                    const markdownUrl = markdownMatch[1];
                    if (this.settings.uploadedImages.find((item) => item.imgUrl === markdownUrl)) {
                        this.addRemoveMenu(menu, markdownUrl, editor);
                    }
                }
            }
        }));
    }
    addRemoveMenu = (menu, imgPath, editor) => {
        menu.addItem((item) => item
            .setIcon("trash-2")
            .setTitle(t("Delete image using PicList"))
            .onClick(async () => {
            try {
                const selectedItem = this.settings.uploadedImages.find((item) => item.imgUrl === imgPath);
                if (selectedItem) {
                    const res = await this.picGoDeleter.deleteImage([selectedItem]);
                    if (res.success) {
                        new obsidian.Notice(t("Delete successfully"));
                        const selection = editor.getSelection();
                        if (selection) {
                            editor.replaceSelection("");
                        }
                        this.settings.uploadedImages =
                            this.settings.uploadedImages.filter((item) => item.imgUrl !== imgPath);
                        this.saveSettings();
                    }
                    else {
                        new obsidian.Notice(t("Delete failed"));
                    }
                }
            }
            catch {
                new obsidian.Notice(t("Error, could not delete"));
            }
        }));
    };
    registerFileMenu() {
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source, leaf) => {
            if (source === "canvas-menu")
                return false;
            if (!isAssetTypeAnImage(file.path))
                return false;
            menu.addItem((item) => {
                item
                    .setTitle("Image Auto Upload Pro: Upload")
                    .setIcon("upload")
                    .onClick(() => {
                    if (!(file instanceof obsidian.TFile)) {
                        return false;
                    }
                    this.fileMenuUpload(file);
                });
            });
        }));
    }
    fileMenuUpload(file) {
        let imageList = [];
        const fileArray = this.helper.getAllFiles();
        for (const match of fileArray) {
            const imageName = match.name;
            const encodedUri = match.path;
            const fileName = pathBrowserifyExports.basename(decodeURI(encodedUri));
            if (file && file.name === fileName) {
                if (isAssetTypeAnImage(file.path)) {
                    imageList.push({
                        path: file.path,
                        name: imageName,
                        source: match.source,
                        file: file,
                    });
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        this.upload(imageList).then(res => {
            if (!res.success) {
                new obsidian.Notice("Upload error");
                return;
            }
            let uploadUrlList = res.result;
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    filterFile(fileArray) {
        const imageList = [];
        for (const match of fileArray) {
            if (match.path.startsWith("http")) {
                if (this.settings.workOnNetWork) {
                    if (!this.helper.hasBlackDomain(match.path, this.settings.newWorkBlackDomains)) {
                        imageList.push({
                            path: match.path,
                            name: match.name,
                            source: match.source,
                        });
                    }
                }
            }
            else {
                imageList.push({
                    path: match.path,
                    name: match.name,
                    source: match.source,
                });
            }
        }
        return imageList;
    }
    /**
     * 替换上传的图片
     */
    replaceImage(imageList, uploadUrlList) {
        let content = this.helper.getValue();
        imageList.map(item => {
            const uploadImage = uploadUrlList.shift();
            let name = this.handleName(item.name);
            content = content.replaceAll(item.source, `![${name}](${uploadImage})`);
        });
        this.helper.setValue(content);
        if (this.settings.deleteSource) {
            imageList.map(image => {
                if (image.file && !image.path.startsWith("http")) {
                    this.app.fileManager.trashFile(image.file);
                }
            });
        }
    }
    /**
     * 上传所有图片
     */
    uploadAllFile() {
        const activeFile = this.app.workspace.getActiveFile();
        const fileMap = arrayToObject(this.app.vault.getFiles(), "name");
        const filePathMap = arrayToObject(this.app.vault.getFiles(), "path");
        let imageList = [];
        const fileArray = this.filterFile(this.helper.getAllFiles());
        for (const match of fileArray) {
            const imageName = match.name;
            const uri = decodeURI(match.path);
            if (uri.startsWith("http")) {
                imageList.push({
                    path: match.path,
                    name: imageName,
                    source: match.source,
                    file: null,
                });
            }
            else {
                const fileName = pathBrowserifyExports.basename(uri);
                let file;
                // 优先匹配绝对路径
                if (filePathMap[uri]) {
                    file = filePathMap[uri];
                }
                // 相对路径
                if ((!file && uri.startsWith("./")) || uri.startsWith("../")) {
                    const filePath = obsidian.normalizePath(pathBrowserifyExports.resolve(pathBrowserifyExports.dirname(activeFile.path), uri));
                    file = filePathMap[filePath];
                }
                // 尽可能短路径
                if (!file) {
                    file = fileMap[fileName];
                }
                if (file) {
                    if (isAssetTypeAnImage(file.path)) {
                        imageList.push({
                            path: obsidian.normalizePath(file.path),
                            name: imageName,
                            source: match.source,
                            file: file,
                        });
                    }
                }
            }
        }
        if (imageList.length === 0) {
            new obsidian.Notice(t("Can not find image file"));
            return;
        }
        else {
            new obsidian.Notice(`Have found ${imageList.length} images`);
        }
        this.upload(imageList).then(res => {
            let uploadUrlList = res.result;
            if (imageList.length !== uploadUrlList.length) {
                new obsidian.Notice(t("Warning: upload files is different of reciver files from api"));
                return;
            }
            const currentFile = this.app.workspace.getActiveFile();
            if (activeFile.path !== currentFile.path) {
                new obsidian.Notice(t("File has been changedd, upload failure"));
                return;
            }
            this.replaceImage(imageList, uploadUrlList);
        });
    }
    setupPasteHandler() {
        this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, markdownView) => {
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload-pro", this.settings.uploadByClipSwitch);
            const clipboardData = evt.clipboardData;
            if (!clipboardData) {
                return;
            }
            clipboardData.files;
            if (!allowUpload) {
                return;
            }
            // 剪贴板内容有md格式的图片时
            if (this.settings.workOnNetWork) {
                const clipboardValue = clipboardData.getData("text/plain");
                const imageList = filterClipperNetworkImages(this.helper.getImageLink(clipboardValue), this.settings.newWorkBlackDomains, this.settings.relayedImageUrls);
                if (imageList.length !== 0 && !this.canUpload(clipboardData)) {
                    // Obsidian's paste event can fire before the editor has inserted
                    // plain Markdown. We own this paste, insert the text first, then
                    // run the relay pipeline so replacement sees the pasted sources.
                    evt.preventDefault();
                    editor.replaceSelection(clipboardValue);
                    window.setTimeout(() => {
                        uploadNetworkImages(this, imageList).catch(error => {
                            new obsidian.Notice(error instanceof Error ? error.message : "Upload error");
                        });
                    }, 50);
                    return;
                }
            }
            // 剪贴板中是图片时进行上传
            if (this.canUpload(clipboardData)) {
                this.uploadFileAndEmbedImgurImage(editor, async (editor, pasteId) => {
                    let res;
                    res = await this.uploadByClipboard(clipboardData.files);
                    if (res.code !== 0) {
                        this.handleFailedUpload(editor, pasteId, res.msg);
                        return;
                    }
                    const url = res.data;
                    return url;
                }, clipboardData).catch();
                evt.preventDefault();
            }
        }));
        this.registerEvent(this.app.workspace.on("editor-drop", async (evt, editor, markdownView) => {
            // when ctrl key is pressed, do not upload image, because it is used to set local file
            if (evt.ctrlKey) {
                return;
            }
            const allowUpload = this.helper.getFrontmatterValue("image-auto-upload-pro", this.settings.uploadByClipSwitch);
            if (!allowUpload) {
                return;
            }
            let files = evt.dataTransfer.files;
            if (files.length !== 0 && files[0].type.startsWith("image")) {
                let sendFiles = [];
                let files = evt.dataTransfer.files;
                Array.from(files).forEach((item, index) => {
                    if (item.path) {
                        sendFiles.push(item.path);
                    }
                    else {
                        const { webUtils } = require("electron");
                        const path = webUtils.getPathForFile(item);
                        sendFiles.push(path);
                    }
                });
                evt.preventDefault();
                const data = await this.upload(sendFiles);
                if (data.success) {
                    data.result.map((value) => {
                        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
                        this.insertTemporaryText(editor, pasteId);
                        this.embedMarkDownImage(editor, pasteId, value, files[0].name);
                    });
                }
                else {
                    new obsidian.Notice("Upload error");
                }
            }
        }));
    }
    canUpload(clipboardData) {
        this.settings.applyImage;
        const files = clipboardData.files;
        const text = clipboardData.getData("text");
        const hasImageFile = files.length !== 0 && files[0].type.startsWith("image");
        if (hasImageFile) {
            if (!!text) {
                return this.settings.applyImage;
            }
            else {
                return true;
            }
        }
        else {
            return false;
        }
    }
    async uploadFileAndEmbedImgurImage(editor, callback, clipboardData) {
        let pasteId = (Math.random() + 1).toString(36).substr(2, 5);
        this.insertTemporaryText(editor, pasteId);
        const name = clipboardData.files[0].name;
        try {
            const url = await callback(editor, pasteId);
            this.embedMarkDownImage(editor, pasteId, url, name);
        }
        catch (e) {
            this.handleFailedUpload(editor, pasteId, e);
        }
    }
    insertTemporaryText(editor, pasteId) {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        editor.replaceSelection(progressText + "\n");
    }
    static progressTextFor(id) {
        return `![Uploading file...${id}]()`;
    }
    embedMarkDownImage(editor, pasteId, imageUrl, name = "") {
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        name = this.handleName(name);
        let markDownImage = `![${name}](${imageUrl})`;
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, markDownImage);
    }
    handleFailedUpload(editor, pasteId, reason) {
        new obsidian.Notice(reason);
        console.error("Failed request: ", reason);
        let progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
        imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, "⚠️upload failed, check dev console");
    }
    handleName(name) {
        const imageSizeSuffix = this.settings.imageSizeSuffix || "";
        if (this.settings.imageDesc === "origin") {
            return `${name}${imageSizeSuffix}`;
        }
        else if (this.settings.imageDesc === "none") {
            return "";
        }
        else if (this.settings.imageDesc === "removeDefault") {
            if (name === "image.png") {
                return "";
            }
            else {
                return `${name}${imageSizeSuffix}`;
            }
        }
        else {
            return `${name}${imageSizeSuffix}`;
        }
    }
    static replaceFirstOccurrence(editor, target, replacement) {
        let lines = editor.getValue().split("\n");
        for (let i = 0; i < lines.length; i++) {
            let ch = lines[i].indexOf(target);
            if (ch != -1) {
                let from = { line: i, ch: ch };
                let to = { line: i, ch: ch + target.length };
                editor.replaceRange(replacement, from, to);
                break;
            }
        }
    }
}

module.exports = imageAutoUploadPlugin;


/* nosourcemap */