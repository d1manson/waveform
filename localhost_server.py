#!/usr/bin/env python
# Copyright (c) 2012 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import BaseHTTPServer
import logging
import multiprocessing
import optparse
import os
import SimpleHTTPServer  # pylint: disable=W0611
import socket
import sys
import time
import urlparse

if sys.version_info < (2, 6, 0):
  sys.stderr.write("python 2.6 or later is required run this script\n")
  sys.exit(1)


EXPECTED_DIRECTORY_NAME = "waveform"
this_file_full_path = os.path.dirname(os.path.realpath(sys.argv[0]))

# We only serve from a folder called EXPECTED_DIRECTORY_NAME
# We only serve via the loopback interface.
def SanityCheckDirectory(dirname):
  run_from_dir = os.path.basename(os.path.normpath(dirname))

  if run_from_dir == EXPECTED_DIRECTORY_NAME:
    return
  logging.error('I refuse to serve from %s.' % run_from_dir)
  logging.error('I was expecting to be in %s.' % EXPECTED_DIRECTORY_NAME)
  logging.error('Run with --no-dir-check to bypass this check.')
  sys.exit(1)


class HTTPServer(BaseHTTPServer.HTTPServer):
  def __init__(self, *args, **kwargs):
    BaseHTTPServer.HTTPServer.__init__(self, *args)
    self.running = True
    self.result = 0

  def Shutdown(self, result=0):
    self.running = False
    self.result = result


class HTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
  def _SendNothingAndDie(self, result=0):
    self.send_response(200, 'OK')
    self.send_header('Content-type', 'text/html')
    self.send_header('Content-length', '0')
    self.end_headers()
    self.server.Shutdown(result)

  def do_GET(self):
    # Browsing to ?quit=1 will kill the server cleanly.
    _, _, _, query, _ = urlparse.urlsplit(self.path)
    if query:
      params = urlparse.parse_qs(query)
      if '1' in params.get('quit', []):
        self._SendNothingAndDie()
        return

    return SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self)


class LocalHTTPServer(object):
  """Class to start a local HTTP server as a child process."""

  def __init__(self, dirname, port):
    parent_conn, child_conn = multiprocessing.Pipe()
    self.process = multiprocessing.Process(
        target=_HTTPServerProcess,
        args=(child_conn, dirname, port, {}))
    self.process.start()
    if parent_conn.poll(10):  # wait 10 seconds
      self.port = parent_conn.recv()
    else:
      raise Exception('Unable to launch HTTP server.')

    self.conn = parent_conn

  def ServeForever(self):
    """Serve until the child HTTP process tells us to stop.

    Returns:
      The result from the child (as an errorcode), or 0 if the server was
      killed not by the child (by KeyboardInterrupt for example).
    """
    child_result = 0
    try:
      # Block on this pipe, waiting for a response from the child process.
      child_result = self.conn.recv()
    except KeyboardInterrupt:
      pass
    finally:
      self.Shutdown()
    return child_result

  def ServeUntilSubprocessDies(self, process):
    """Serve until the child HTTP process tells us to stop or |subprocess| dies.

    Returns:
      The result from the child (as an errorcode), or 0 if |subprocess| died,
      or the server was killed some other way (by KeyboardInterrupt for
      example).
    """
    child_result = 0
    try:
      while True:
        if process.poll() is not None:
          child_result = 0
          break
        if self.conn.poll():
          child_result = self.conn.recv()
          break
        time.sleep(0)
    except KeyboardInterrupt:
      pass
    finally:
      self.Shutdown()
    return child_result

  def Shutdown(self):
    """Send a message to the child HTTP server process and wait for it to
        finish."""
    self.conn.send(False)
    self.process.join()

  def GetURL(self, rel_url):
    """Get the full url for a file on the local HTTP server.

    Args:
      rel_url: A URL fragment to convert to a full URL. For example,
          GetURL('foobar.baz') -> 'http://localhost:1234/foobar.baz'
    """
    return 'http://localhost:%d/%s' % (self.port, rel_url)


def _HTTPServerProcess(conn, dirname, port, server_kwargs):
  """Run a local httpserver with the given port or an ephemeral port.

  This function assumes it is run as a child process using multiprocessing.

  Args:
    conn: A connection to the parent process. The child process sends
        the local port, and waits for a message from the parent to
        stop serving. It also sends a "result" back to the parent -- this can
        be used to allow a client-side test to notify the server of results.
    dirname: The directory to serve. All files are accessible through
       http://localhost:<port>/path/to/filename.
    port: The port to serve on. If 0, an ephemeral port will be chosen.
    server_kwargs: A dict that will be passed as kwargs to the server.
  """
  try:
    os.chdir(dirname)
    httpd = HTTPServer(('', port), HTTPRequestHandler, **server_kwargs)
  except socket.error as e:
    sys.stderr.write('Error creating HTTPServer: %s\n' % e)
    sys.exit(1)

  try:
    conn.send(httpd.server_address[1])  # the chosen port number
    httpd.timeout = 0.5  # seconds
    while httpd.running:
      # Flush output for MSVS Add-In.
      sys.stdout.flush()
      sys.stderr.flush()
      httpd.handle_request()
      if conn.poll():
        httpd.running = conn.recv()
  except KeyboardInterrupt:
    pass
  finally:
    conn.send(httpd.result)
    conn.close()


def main(args):
  parser = optparse.OptionParser()
  parser.add_option('-p', '--port',
      help='Run server on this port.', default=5103)
  parser.add_option('--no-dir-check', '--no_dir_check',
      help='No check to ensure serving from safe directory.',
      dest='do_safe_check', action='store_false', default=True)

  # To enable bash completion for this command first install optcomplete
  # and then add this line to your .bashrc:
  #  complete -F _optcomplete httpd.py
  try:
    import optcomplete
    optcomplete.autocomplete(parser)
  except ImportError:
    pass

  options, args = parser.parse_args(args)
  options.serve_dir = this_file_full_path

  if options.do_safe_check:
    SanityCheckDirectory(options.serve_dir)

  server = LocalHTTPServer(options.serve_dir, int(options.port))

  # Serve until the client tells us to stop. When it does, it will give us an
  # errorcode.
  print 'Serving %s on %s...' % (options.serve_dir, server.GetURL(''))
  return server.ServeForever()

if __name__ == '__main__':
  sys.exit(main(sys.argv[1:]))
