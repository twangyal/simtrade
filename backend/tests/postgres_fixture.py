"""Shared owner of disposable, Unix-socket-only PostgreSQL test clusters."""
import os
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch

import psycopg2


class DisposablePostgres:
    @classmethod
    def setUpClass(cls):
        cls.bin = Path(os.environ['SIMTRADE_TEST_PG_BIN'])
        cls.temp = tempfile.TemporaryDirectory(prefix='simtrade-index-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.data = cls.root / 'data'
        cls.socket = cls.root / 'socket'
        cls.socket.mkdir()
        cls.passfile = cls.root / 'empty.pgpass'
        cls.passfile.touch(mode=0o600)
        cls.run_pg('initdb', '-D', str(cls.data), '-U', 'synthetic',
                   '--auth-local=trust', '--auth-host=reject', '--no-locale')
        cls.addClassCleanup(cls.stop_pg)
        cls.run_pg('pg_ctl', '-D', str(cls.data), '-l', str(cls.root / 'server.log'),
                   '-o', f'-k {cls.socket} -h "" -p 55441', '-w', 'start')
        cls.connection = cls.connect()
        cls.connection.autocommit = True
        cls.addClassCleanup(cls.connection.close)

    @classmethod
    def connection_environment(cls):
        # libpq merges ambient PGHOSTADDR/PGSERVICE even with explicit host/user/db.
        # Preserve proxies, CA settings and all other environment variables.
        return {**{key: value for key, value in os.environ.items()
                   if not key.startswith('PG')}, 'PGPASSFILE': str(cls.passfile)}

    @classmethod
    def connect(cls):
        # psycopg2 has no per-connection env argument. Restore the test process
        # environment immediately afterward; this harness is single-threaded.
        with patch.dict(os.environ, cls.connection_environment(), clear=True):
            return psycopg2.connect(host=str(cls.socket), port=55441,
                                    user='synthetic', dbname='postgres',
                                    passfile=str(cls.passfile), connect_timeout=5)

    @classmethod
    def run_pg(cls, command, *args):
        subprocess.run([str(cls.bin / command), *args], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    @classmethod
    def stop_pg(cls):
        # Register before startup: pg_ctl can time out with a server still running.
        stopped = subprocess.run(
            [str(cls.bin / 'pg_ctl'), '-D', str(cls.data), '-m', 'immediate',
             '-w', 'stop'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if stopped.returncode:
            status = subprocess.run(
                [str(cls.bin / 'pg_ctl'), '-D', str(cls.data), 'status'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            if status.returncode == 0:
                raise RuntimeError('Disposable PostgreSQL server did not stop')
