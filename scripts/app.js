function browse() {
    var file = document.getElementById('browse');
    file.click();
}

var totalUploads = 0;
var uploads = 0;
var files = [];
var albumAssociated = false;

function uploadUrl(url) {
    var droparea = document.getElementById('droparea');
    droparea.style.overflowY = 'scroll';
    droparea.className = 'files';
    if (totalUploads == 0) {
        document.getElementById('files').innerHTML = '';
        totalUploads++;
    }
    if (totalUploads > 1) {
        document.getElementById('createAlbum').className = '';
    }
    var preview = createPreview({ type: 'image/png', name: url }, url); // Note: we only allow uploading images by URL, not AV
    var p = document.createElement('p');
    p.textContent = 'Uploading...';
    preview.fileStatus.appendChild(p);
    preview.progress.style.width = '100%';
    uploads++;
    updateAlbum();
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/url');
    xhr.onload = function() {
        var responseJSON = JSON.parse(this.responseText);
        if (this.status == 200 || this.status == 409) {
            p.textContent = 'Waiting to process...';
            p.title = 'We are working on a lot of files right now, but your file is queued for processing.';
            preview.fileStatus.appendChild(p);
            hash = responseJSON['hash'];
            files.push(hash);
            preview.progress.className += ' progress-grey';
            preview.progress.style.width = '100%';
            setTimeout(function() {
                checkStatus(hash, preview.fileStatus, preview.progress, p);
            }, 1000);
        } else {
            var error = document.createElement('span');
            error.className = 'error';
            error.textContent = 'An error occured while processing this image.';
            preview.fileStatus.appendChild(error);
        }
    };
    var formData = new FormData();
    formData.append('url', url);
    xhr.send(formData);
}

function handleFiles(files) {
    var droparea = document.getElementById('droparea');
    droparea.style.overflowY = 'scroll';
    droparea.className = 'files';
    if (totalUploads == 0) {
        document.getElementById('files').innerHTML = '';
    }
    totalUploads += files.length;
    if (totalUploads > 1) {
        document.getElementById('createAlbum').className = '';
    }
    var timeout = 500;
    for (var i = 0; i < files.length; i++) {
        uploads++;
        updateAlbum();
        if (i == 0)
            handleFile(files[i]);
        else {
            void function(i) {
                setTimeout(function() {
                    handleFile(files[i]);
                }, timeout);
            }(i);
            timeout += 500;
        }
    }
}

function createAlbum(e) {
    e.preventDefault();
    if (albumAssociated) {
        updateAlbum();
        return;
    }
    albumAssociated = true;
    document.getElementById('createAlbum').className = 'hidden';
    document.getElementById('albumPending').classList.remove('hidden');
    updateAlbum();
}

function updateAlbum() {
    if (!albumAssociated) return;
    if (files.length <= 1) {
        document.getElementById('createAlbum').classList.add('hidden');
        document.getElementById('albumPending').classList.add('hidden');
        document.getElementById('albumUrl').parentElement.classList.add('hidden');
    }
    if (uploads > 0 && !albumAssociated) {
        document.getElementById('createAlbum').classList.remove('hidden');
        document.getElementById('albumPending').classList.remove('hidden');
        document.getElementById('albumUrl').parentElement.classList.add('hidden');
    } else {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/album/create');
        xhr.onload = function() {
            if (this.status != 200) {
                document.getElementById('albumPending').textContent = 'An error occured creating this album. ';
                var create = document.getElementById('createAlbum');
                create.textContent = 'Try again';
                create.classList.remove('hidden');
                return;
            }
            var data = JSON.parse(this.responseText);
            document.getElementById('createAlbum').className = 'hidden';
            document.getElementById('albumPending').classList.add('hidden');
            var url = document.getElementById('albumUrl');
            url.textContent = window.location.origin + '/' + data.hash;
            url.href = window.location.origin + '/' + data.hash;
            url.parentElement.classList.remove('hidden');
            addItemToHistory(data.hash);
        };
        var form = new FormData();
        form.append('list', files.join(','));
        xhr.send(form);
    }
}

function handleFile(file) {
    var reader = new FileReader();
    var droparea = document.getElementById('droparea');
    var preview = createPreview(file);
    reader.onloadend = function(e) {
        var data = e.target.result;
        var hash = btoa(rstr_md5(data)).substr(0, 12).replace('+', '-', 'g').replace('/', '_', 'g');
        if (!preview.supported) {
            var error = document.createElement('span');
            error.className = 'error';
            error.textContent = 'This filetype is not supported.';
            preview.fileStatus.appendChild(error);
            files.remove(files.indexOf(hash));
            updateAlbum();
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/' + hash + '/exists');
            xhr.onload = function() {
                files.push(hash);
                if (this.status == 200) {
                    var p = document.createElement('p');
                    p.textContent = 'Upload complete!';
                    var a = document.createElement('a');
                    a.setAttribute('target', '_blank');
                    a.textContent = window.location.origin + '/' + hash;
                    a.href = '/' + hash;
                    var a2 = document.createElement('a');
                    a2.setAttribute('target', '_blank');
                    a2.href = '/' + hash;
                    a2.className = 'full-size';
                    preview.fileStatus.appendChild(p);
                    preview.fileStatus.appendChild(a);
                    preview.fileStatus.parentElement.appendChild(a2);
                    uploads--;
                    updateAlbum();
                    addItemToHistory(hash);
                } else {
                    var p = document.createElement('p');
                    p.textContent = 'Uploading...';
                    preview.fileStatus.appendChild(p);
                    uploadFile(file, preview.fileStatus, preview.progress, hash);
                }
            };
            xhr.send();
        }
    };
    if (file.size < 10485760) { // 10 MB
        reader.readAsBinaryString(file);
    } else {
        // Skip hashing and loading this into memory, it's too big to do so performantly
        var p = document.createElement('p');
        p.textContent = 'Uploading...';
        preview.fileStatus.appendChild(p);
        uploadFile(file, preview.fileStatus, preview.progress);
    }
}

function uploadFile(file, statusUI, progressUI, hash) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/file');
    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            progressUI.style.width = (e.loaded / e.total) * 100 + '%';
        }
    };
    xhr.onload = function() {
        var error = null;
        var responseJSON = JSON.parse(this.responseText);

        if (this.status == 415) {
            error = 'This media format is not supported.';
        } else if (this.status == 409) {
            finish(statusUI, responseJSON['hash']);
        } else if (this.status == 420) {
            error = 'You have consumed your hourly quota. Try again later.';
        } else if (this.status == 200) {
            if (!hash) {
                files.push(responseJSON['hash']);
            }
            statusUI.innerHTML = '';
            var p = document.createElement('p');
            p.textContent = 'Waiting to process...';
            p.title = 'We are working on a lot of files right now, but your file is queued for processing.';
            statusUI.appendChild(p);
            hash = responseJSON['hash'];
            progressUI.className += ' progress-grey';
            progressUI.style.width = '100%';
            setTimeout(function() {
                checkStatus(hash, statusUI, progressUI, p);
            }, 1000);
        }
        if (error) {
            progressUI.parentElement.removeChild(progressUI);
            var errorText = document.createElement('p');
            errorText.className = 'error';
            errorText.textContent = error;
            statusUI.appendChild(errorText);
            progressUI.style.width = 0;
            if (hash) {
                files.remove(files.indexOf(hash));
            }
            updateAlbum();
        }
    };
    var formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
}

function checkStatus(hash, statusUI, progressUI, text) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/' + hash + '/status');
    xhr.onload = function() {
        responseJSON = JSON.parse(this.responseText);
        if (responseJSON['status'] == 'done' || responseJSON['status'] == 'ready') {
            progressUI.parentElement.removeChild(progressUI);
            finish(statusUI, hash);
            updateAlbum();
        } else if (responseJSON['status'] == 'processing') {
            text.title = '';
            text.textContent = 'Processing...';
            progressUI.className = 'progress progress-green';
            setTimeout(function() {
                checkStatus(hash, statusUI, progressUI, text);
            }, 1000);
        } else if (responseJSON['status'] == 'timeout' || responseJSON['status'] == 'error' || responseJSON['status'] == 'internal_error') {
            progressUI.parentElement.removeChild(progressUI);
            var error = document.createElement('p');
            error.className = 'error';
            statusUI.innerHTML = '';
            if (responseJSON['status'] == 'timeout') {
                error.textContent = 'This file took too long to process.';
            } else {
                error.textContent = 'There was an error processing this file.';
            }
            statusUI.appendChild(error);
            files.remove(files.indexOf(hash));
            uploads--;
            updateAlbum();
        } else {
            setTimeout(function() {
                checkStatus(hash, statusUI, progressUI, text);
            }, 1000);
        }
    };
    xhr.send();
}

function finish(statusUI, hash) {
    var p = document.createElement('p');
    p.textContent = 'Upload complete! ';
    var a = document.createElement('a');
    a.setAttribute('target', '_blank');
    a.textContent = window.location.origin + '/' + hash;
    a.href = '/' + hash;
    var deleteLink = document.createElement('a');
    deleteLink.textContent = 'Delete';
    deleteLink.href = '/api/' + hash + '/delete';
    deleteLink.className = 'delete';
    deleteLink.onclick = function(e) {
        e.preventDefault();
        confirm(function(a) {
            if (!a) return;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/' + hash + '/delete');
            files.remove(files.indexOf(hash));
            xhr.send();
            var container = statusUI.parentElement;
            container.parentElement.removeChild(container);
            var hashIndex = -1;
            for (var i = 0; i < history.length; i++) {
                if (history[i] == hash) {
                    hashIndex = i;
                    break;
                }
            }
            if (history) {
                history.remove(hashIndex);
                window.localStorage.setItem('history', JSON.stringify(history));
            }
        });
    };
    var a2 = document.createElement('a');
    a2.setAttribute('target', '_blank');
    a2.href = '/' + hash;
    a2.className = 'full-size';
    statusUI.innerHTML = '';
    statusUI.appendChild(p);
    statusUI.appendChild(a);
    statusUI.parentElement.appendChild(a2);
    statusUI.parentElement.appendChild(deleteLink);
    uploads--;
    addItemToHistory(hash);
}

function createPreview(file) {
    var container = document.createElement('div');
    container.className = 'image-loading';
    var wrapper = document.createElement('div');
    wrapper.className = 'img-wrapper';
    var uri;
    if (file instanceof File) {
        uri = URL.createObjectURL(file);
    } else {
        uri = file.name;
    }

    var preview = null;
    if (file.type.indexOf('image/') == 0) {
        preview = document.createElement('img');
        preview.src = uri;
    } else if (file.type.indexOf('audio/') == 0) {
        preview = document.createElement('img');
        preview.src = '/static/audio.png';
    } else if (file.type.indexOf('video/') == 0) {
        preview = document.createElement('video');
        preview.setAttribute('loop', 'loop');
        var source = document.createElement('source');
        source.addEventListener('error', function() {
            preview.parentElement.replaceChild(fallback, preview);
        }, false);
        source.setAttribute('src', uri);
        source.setAttribute('type', file.type);
        preview.appendChild(source);
        var fallback = document.createElement('img');
        fallback.src = '/static/video.png';
        preview.volume = 0;
        preview.play();
    }

    var name = document.createElement('h2');
    name.textContent = file.name;
    name.setAttribute('title', file.name);
    var fileStatus = document.createElement('div');
    fileStatus.className = 'status';
    var progress = document.createElement('div');
    progress.className = 'progress';
    progress.style.width = 0;
    var responsiveFade = document.createElement('div');
    responsiveFade.className = 'responsive-fade';

    if (preview !== null) {
        wrapper.appendChild(preview);
    }
    container.appendChild(wrapper);
    container.appendChild(responsiveFade);
    container.appendChild(name);
    container.appendChild(fileStatus);
    container.appendChild(progress);
    var fileList = document.getElementById('files');
    fileList.appendChild(container);

    return { supported: true, fileStatus: fileStatus, progress: progress };
}

function dragNop(e) {
    e.stopPropagation();
    e.preventDefault();
}

function dragDrop(e) {
    dragNop(e);
    var droparea = document.getElementById('droparea');
    droparea.className = null;
    var files = e.dataTransfer.files;
    var count = files.length;

    if (count > 0) {
        handleFiles(files);
    }
}

function dragEnter(e) {
    dragNop(e);
    var droparea = document.getElementById('droparea');
    droparea.className = 'hover';
}

function dragLeave(e) {
    dragNop(e);
    var droparea = document.getElementById('droparea');
    droparea.className = null;
}

navigator.getUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia
    || navigator.msGetUserMedia;
window.AudioContext = window.AudioContext
    || window.webkitAudioContext 
    || window.mozAudioContext 
    || window.msAudioContext;
var mediaStream = null;
var audioContext = null;
function dropEnable() {
    window.addEventListener('dragenter', dragEnter, false);
    window.addEventListener('dragleave', dragLeave, false);
    window.addEventListener('dragover', dragNop, false);
    window.addEventListener('drop', dragDrop, false);
    var pasteTarget = document.getElementById('paste-target');
    pasteTarget.addEventListener('paste', handlePaste, false);
    forceFocus();
    var file = document.getElementById('browse');
    file.addEventListener('change', function() {
        handleFiles(file.files);
    }, false);
    var link = document.getElementById('browseLink');
    link.addEventListener('click', function(e) {
        e.preventDefault();
        browse();
    }, false);
    var create = document.getElementById('createAlbum');
    create.addEventListener('click', createAlbum, false);
    var record = document.getElementById('record');
    if (navigator.getUserMedia) {
        audioContext = new AudioContext;
        record.classList.remove('hidden');
        record.querySelector('.button').addEventListener('click', checkForAudio, false);
    }
    setTimeout(handleHistory, 50);
}

function checkForAudio(e) {
    e.preventDefault();
    if (recording) {
        stopRecording();
        return;
    }
    clearAudioBuffers();
    document.querySelector('#record').classList.add('active');
    if (mediaStream !== null) {
        recording = true;
    } else {
        navigator.getUserMedia({ audio: true }, function(stream) {
            mediaStream = stream;
            recordUserAudio();
            recording = true;
        }, function(error) {
            document.querySelector('#record .info').textContent = 'An error occured.';
        });
    }
}

var sampleRate = null;
var buffers = { l: [], r: [], totalLength: 0 };
var recording = false;
function recordUserAudio() {
    var inputPoint = audioContext.createGain();
    var input = audioContext.createMediaStreamSource(mediaStream);
    input.connect(inputPoint);
    
    var node = inputPoint.context.createScriptProcessor(4096, 2, 2);
    sampleRate = inputPoint.context.sampleRate;
    node.onaudioprocess = recordPart;
    inputPoint.connect(node);
    node.connect(inputPoint.context.destination);

    var zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect(zeroGain);
    zeroGain.connect(audioContext.destination);
}

function clearAudioBuffers() {
    buffers = { l: [], r: [], totalLength: 0 };
}

function recordPart(e) {
    if (!recording) return;
    var l = e.inputBuffer.getChannelData(0);
    var r = e.inputBuffer.getChannelData(1);
    buffers.l.push(l);
    buffers.r.push(r);
    buffers.totalLength += l.length;
}

function stopRecording() {
    recording = false;
    document.querySelector('#record .info').textContent = 'Processing...';
    setTimeout(function() {
        var l = mergeBuffers(buffers.l, buffers.totalLength);
        var r = mergeBuffers(buffers.r, buffers.totalLength);
        var interleaved = interleave(l, r);
        var wav = encodeWAV(interleaved);
        var blob = new Blob([wav], { type: 'audio/wav' });
        blob.name = 'Microphone';
        handleFiles([ blob ]);
        document.querySelector('#record .info').textContent = 'Recording...';
        document.querySelector('#record').classList.remove('active');
    }, 100);
}

// A lot of this audio stuff is adapted from https://github.com/mattdiamond/Recorderjs
function mergeBuffers(buffers, length) {
    var result = new Float32Array(length);
    var offset = 0;
    for (var i = 0; i < buffers.length; i++) {
        result.set(buffers[i], offset);
        offset += buffers[i].length;
    }
    return result;
}

function interleave(l, r) {
    var length = l.length + r.length;
    var result = new Float32Array(length);
    var i = 0, ii = 0;
    while (i < length) {
        result[i++] = l[ii];
        result[i++] = r[ii];
        ii++;
    }
    return result;
}

function writeString(view, offset, string) {
    for (var i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset+=2) {
        var s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function encodeWAV(samples) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */ writeString(view, 12, 'fmt ');
    /* format chunk length */ view.setUint32(16, 16, true);
    /* sample format (raw) */ view.setUint16(20, 1, true);
    /* channel count */ view.setUint16(22, 2, true);
    /* sample rate */ view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */ view.setUint32(28, sampleRate * 4, true);
    /* block align (channel count * bytes per sample) */ view.setUint16(32, 4, true);
    /* bits per sample */ view.setUint16(34, 16, true);
    /* data chunk identifier */ writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    floatTo16BitPCM(view, 44, samples);
    return view;
}

function forceFocus() {
    if (document.activeElement.tagName == 'TEXTAREA' || document.activeElement.tagName == 'INPUT') {
        setTimeout(forceFocus, 250);
        return;
    }
    var pasteTarget = document.getElementById('paste-target');
    pasteTarget.focus();
    setTimeout(forceFocus, 250);
}

function handleHistory() {
    loadHistory();
    var statusElement = document.getElementById('historyEnabled');
    if (historyEnabled)
        statusElement.textContent = 'Disable local history';
    else
        statusElement.textContent = 'Enable local history';
    var historyElement = document.getElementById('history');
    var blurb = document.getElementById('blurb');
    if (history.length != 0) {
        historyElement.classList.remove('hidden');
        blurb.classList.add('hidden');
    }
    var slice = history.length - 4;
    if (slice < 0)
        slice = 0;
    var items = history.slice(slice).reverse();
    var historyList = historyElement.querySelectorAll('ul')[0];
    loadDetailedHistory(items, function(result) {
        for (var i = 0; i < items.length; i++) {
            if (result[items[i]]) {
                historyList.appendChild(createHistoryItem({
                    item: result[items[i]],
                    hash: items[i]
                }));
            }
        }
    });
}

function createHistoryItem(data) {
    var item = data.item;
    var container = null;
    if (data.base)
        container = document.createElement(data.base);
    else
        container = document.createElement('li');
    var preview = null;
    if (item.type == 'image/gif' || item.type.indexOf('video/') == 0) {
        preview = document.createElement('video');
        preview.setAttribute('loop', 'loop');
        for (var i = 0; i < item.files.length; i++) {
            if (item.files[i].type == 'image/gif')
                continue;
            var source = document.createElement('source');
            source.setAttribute('src', item.files[i].file);
            source.setAttribute('type', item.files[i].type);
            preview.appendChild(source);
        }
        preview.volume = 0;
        preview.className = 'item-view';
        preview.onmouseenter = function(e) {
            e.target.play();
        };
        preview.onmouseleave = function(e) {
            e.target.pause();
        };
    } else if (item.type.indexOf('image/') == 0) {
        preview = document.createElement('img');
        preview.src = item.original;
        preview.className = 'item-view';
    } else if (item.type.indexOf('audio/') == 0) {
        preview = document.createElement('img');
        preview.src = '/static/audio-player-narrow.png';
        preview.className = 'item-view';
    } else if (item.type == 'application/album') {
        preview = document.createElement('div');
        preview.className = 'album-preview';
        for (var i = 0; i < item.files.length && i < 3; i++) {
            preview.appendChild(createHistoryItem({ item: item.files[i], hash: item.files[i].hash, nolink: true, base: 'div' }));
        }
    } else {
        return container;
    }
    if (!data.nolink) {
        var a = document.createElement('a');
        a.href = '/' + data.hash;
        a.target = '_blank';
        a.appendChild(preview);
        container.appendChild(a);
    } else {
        container.appendChild(preview);
    }
    return container;
}

function toggleHistory() {
    var statusElement = document.getElementById('historyEnabled');
    if (historyEnabled) {
        createCookie('hist-opt-out', '1', 3650);
        statusElement.textContent = 'Enable local history';
    } else {
        createCookie('hist-opt-out', '', 0);
        statusElement.textContent = 'Disable local history';
    }
    historyEnabled = !historyEnabled;
}

function handlePaste(e) {
    var target = document.getElementById('paste-target');
    if (e.clipboardData) {
        var text = e.clipboardData.getData('text/plain');
        if (text) {
            if (text.indexOf('http://') == 0 || text.indexOf('https://') == 0)
                uploadUrl(text);
            else
                ; // TODO: Pastebin
            target.innerHTML = '';
        } else {
            if (e.clipboardData.items) { // webkit
                for (var i = 0; i < e.clipboardData.items.length; i++) {
                    if (e.clipboardData.items[i].type.indexOf('image/') == 0) {
                        var file = e.clipboardData.items[i].getAsFile();
                        file.name = 'clipboard';
                        handleFiles([ file ]);
                    }
                }
                target.innerHTML = '';
            } else { // not webkit
                var check = function() {
                    if (target.innerHTML != '') {
                        var img = target.firstChild.src; // data URL
                        if (img.indexOf('data:image/png;base64,' == 0)) {
                            var blob = dataURItoBlob(img);
                            blob.name = 'clipboard';
                            handleFiles([ blob ]);
                        }
                        target.innerHTML = '';
                    } else {
                        setTimeout(check, 100);
                    }
                };
                check();
            }
        }
    }
}

function dataURItoBlob(dataURI) {
    var byteString = atob(dataURI.split(',')[1]);
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab],{type:'image/png'});
}

window.addEventListener('load', dropEnable, false);
window.onbeforeunload = function() {
    if (uploads != 0) {
        return "If you leave the page, these uploads will be cancelled.";
    }
};

/* Slightly modified version of https://github.com/blueimp/JavaScript-MD5 */
function h(a,g){var c=(a&65535)+(g&65535);return(a>>16)+(g>>16)+(c>>16)<<16|c&65535}function k(a,g,c,l,q,r,b){return h(h(h(a,g&c|~g&l),h(q,b))<<r|h(h(a,g&c|~g&l),h(q,b))>>>32-r,g)}function m(a,g,c,l,q,r,b){return h(h(h(a,g&l|c&~l),h(q,b))<<r|h(h(a,g&l|c&~l),h(q,b))>>>32-r,g)}function n(a,g,c,l,q,r,b){return h(h(h(a,g^c^l),h(q,b))<<r|h(h(a,g^c^l),h(q,b))>>>32-r,g)}function p(a,g,c,l,q,r,b){return h(h(h(a,c^(g|~l)),h(q,b))<<r|h(h(a,c^(g|~l)),h(q,b))>>>32-r,g)}
window.rstr_md5=function(a){var g,c=[];c[(a.length>>2)-1]=void 0;for(g=0;g<c.length;g+=1)c[g]=0;for(g=0;g<8*a.length;g+=8)c[g>>5]|=(a.charCodeAt(g/8)&255)<<g%32;a=8*a.length;c[a>>5]|=128<<a%32;c[(a+64>>>9<<4)+14]=a;var l,q,r,b=1732584193,d=-271733879,e=-1732584194,f=271733878;for(a=0;a<c.length;a+=16)g=b,l=d,q=e,r=f,b=k(b,d,e,f,c[a],7,-680876936),f=k(f,b,d,e,c[a+1],12,-389564586),e=k(e,f,b,d,c[a+2],17,606105819),d=k(d,e,f,b,c[a+3],22,-1044525330),b=k(b,d,e,f,c[a+4],7,-176418897),f=k(f,b,d,e,c[a+5],
12,1200080426),e=k(e,f,b,d,c[a+6],17,-1473231341),d=k(d,e,f,b,c[a+7],22,-45705983),b=k(b,d,e,f,c[a+8],7,1770035416),f=k(f,b,d,e,c[a+9],12,-1958414417),e=k(e,f,b,d,c[a+10],17,-42063),d=k(d,e,f,b,c[a+11],22,-1990404162),b=k(b,d,e,f,c[a+12],7,1804603682),f=k(f,b,d,e,c[a+13],12,-40341101),e=k(e,f,b,d,c[a+14],17,-1502002290),d=k(d,e,f,b,c[a+15],22,1236535329),b=m(b,d,e,f,c[a+1],5,-165796510),f=m(f,b,d,e,c[a+6],9,-1069501632),e=m(e,f,b,d,c[a+11],14,643717713),d=m(d,e,f,b,c[a],20,-373897302),b=m(b,d,e,f,
c[a+5],5,-701558691),f=m(f,b,d,e,c[a+10],9,38016083),e=m(e,f,b,d,c[a+15],14,-660478335),d=m(d,e,f,b,c[a+4],20,-405537848),b=m(b,d,e,f,c[a+9],5,568446438),f=m(f,b,d,e,c[a+14],9,-1019803690),e=m(e,f,b,d,c[a+3],14,-187363961),d=m(d,e,f,b,c[a+8],20,1163531501),b=m(b,d,e,f,c[a+13],5,-1444681467),f=m(f,b,d,e,c[a+2],9,-51403784),e=m(e,f,b,d,c[a+7],14,1735328473),d=m(d,e,f,b,c[a+12],20,-1926607734),b=n(b,d,e,f,c[a+5],4,-378558),f=n(f,b,d,e,c[a+8],11,-2022574463),e=n(e,f,b,d,c[a+11],16,1839030562),d=n(d,e,
f,b,c[a+14],23,-35309556),b=n(b,d,e,f,c[a+1],4,-1530992060),f=n(f,b,d,e,c[a+4],11,1272893353),e=n(e,f,b,d,c[a+7],16,-155497632),d=n(d,e,f,b,c[a+10],23,-1094730640),b=n(b,d,e,f,c[a+13],4,681279174),f=n(f,b,d,e,c[a],11,-358537222),e=n(e,f,b,d,c[a+3],16,-722521979),d=n(d,e,f,b,c[a+6],23,76029189),b=n(b,d,e,f,c[a+9],4,-640364487),f=n(f,b,d,e,c[a+12],11,-421815835),e=n(e,f,b,d,c[a+15],16,530742520),d=n(d,e,f,b,c[a+2],23,-995338651),b=p(b,d,e,f,c[a],6,-198630844),f=p(f,b,d,e,c[a+7],10,1126891415),e=p(e,
f,b,d,c[a+14],15,-1416354905),d=p(d,e,f,b,c[a+5],21,-57434055),b=p(b,d,e,f,c[a+12],6,1700485571),f=p(f,b,d,e,c[a+3],10,-1894986606),e=p(e,f,b,d,c[a+10],15,-1051523),d=p(d,e,f,b,c[a+1],21,-2054922799),b=p(b,d,e,f,c[a+8],6,1873313359),f=p(f,b,d,e,c[a+15],10,-30611744),e=p(e,f,b,d,c[a+6],15,-1560198380),d=p(d,e,f,b,c[a+13],21,1309151649),b=p(b,d,e,f,c[a+4],6,-145523070),f=p(f,b,d,e,c[a+11],10,-1120210379),e=p(e,f,b,d,c[a+2],15,718787259),d=p(d,e,f,b,c[a+9],21,-343485551),b=h(b,g),d=h(d,l),e=h(e,q),f=
h(f,r);c=[b,d,e,f];g="";for(a=0;a<32*c.length;a+=8)g+=String.fromCharCode(c[a>>5]>>>a%32&255);return g};
