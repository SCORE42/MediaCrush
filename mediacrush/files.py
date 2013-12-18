import mimetypes
import base64
import hashlib
import os
import tempfile
import requests

from flask import current_app

from mediacrush.config import _cfg
from mediacrush.database import r, _k
from mediacrush.objects import File
from mediacrush.ratelimit import rate_limit_exceeded, rate_limit_update
from mediacrush.network import secure_ip
from mediacrush.tasks import process_file
from mediacrush.fileutils import EXTENSIONS, get_mimetype, file_storage, extension, delete_file
from mediacrush.celery import app

VIDEO_FORMATS = set(["image/gif", "video/ogg", "video/mp4"])
AUDIO_FORMATS = set(["audio/mpeg", "audio/ogg"])
FORMATS = set(["image/png", "image/jpeg", "image/svg+xml"]) | VIDEO_FORMATS | AUDIO_FORMATS
LOOP_FORMATS = set(["image/gif"])
AUTOPLAY_FORMATS = set(["image/gif"])

class URLFile(object):
    filename = None
    content_type = None
    override_methods = ["save"]

    def __init__(self, *args, **kwargs):
        self.f = tempfile.TemporaryFile()

    def __getattr__(self, name):
        target = self.f if name not in self.override_methods else self
        return getattr(target, name)

    def save(self, path):
        bufsize = 1024 * 1024
        with open(path, "w") as f:
            while True:
                cpbuffer = self.f.read(bufsize)
                if cpbuffer:
                    f.write(cpbuffer)
                else:
                    break

            f.flush()
            f.close()


    def download(self, url):
        r = requests.get(url, stream=True)
        for chunk in r.iter_content(chunk_size=1024):
            self.f.write(chunk)
            self.f.flush()

        if r.status_code == 404:
            return False

        if "content-type" in r.headers:
            self.content_type = r.headers['content-type']
        self.filename = list(reversed(url.split("/")))[0]

        return True

def get_hash(f):
    f.seek(0)
    return hashlib.md5(f.read()).digest()

def media_url(f):
    return '/%s' % f

def file_length(f):
    f.seek(0, 2)
    by = f.tell()
    f.seek(0)

    return by

def upload(f, filename):
    if not f.content_type:
        f.content_type = get_mimetype(filename) or "application/octet-stream"

    if f.content_type.split("/")[0] not in ['video', 'image', 'audio']:
        return "no", 415

    if not current_app.debug:
        rate_limit_update(file_length(f))
        if rate_limit_exceeded():
            return "ratelimit", 420

    h = get_hash(f)
    identifier = to_id(h)
    if "." not in filename:
        #ext = mimetypes.guess_extension(f.content_type) # This not very scientific, but it works
        # jdiez this was causing errors fix it ;_;
        ext = 'wav'
    else:
        ext = extension(filename)

    filename = "%s.%s" % (identifier, ext)
    path = tempfile.NamedTemporaryFile(suffix="." + ext).name # Fix for imagemagick's silliness

    if os.path.exists(file_storage(filename)):
        if File.exists(identifier):
            return identifier, 409
        else:
            # Delete residual files from storage by creating a dummy File
            dummy = File(original=filename)
            dummy.delete = lambda: None # nop
            delete_file(dummy)

    f.seek(0)  # Otherwise it'll write a 0-byte file
    f.save(path)

    file_object = File(hash=identifier)
    file_object.compression = os.path.getsize(path)
    file_object.original = filename
    file_object.mimetype = f.content_type
    file_object.ip = secure_ip()

    result = process_file.delay(path, identifier)
    file_object.taskid = result.id

    file_object.save()

    return identifier


to_id = lambda h: base64.b64encode(h)[:12].replace('/', '_').replace('+', '-')
