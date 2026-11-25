"""Compare one frontend PR with its pinned FTGO Java dependency."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile

FRONTEND = 'scottswindell-hub/ftgo-frontend'
JAVA_REVISION = '6b1b998275ec09c57209f8cc3be9fb9efec01b42'
JAVA_PACKAGE = '0658493796f643f4bd1bef6d9a7524fb'
JAVA_REQUIREMENT = 'f:a5bfb4fa4cc1011b'
FRONTEND_PACKAGE = 'ee0c56cfade94640844ddba231a40ff0'
INPUTS = ('123', '125')
FRONT = [
    ('Browser form', 'src/app.ts', r'const orderId = input\.value\.trim\(\)'),
    ('Browser request', 'src/api.ts', r'response = await fetch\('),
    ('Node proxy', 'server.mjs', r'const upstream = await fetch\('),
]


def verify_revision(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value):
        raise ValueError('Use exact Git commit SHAs')
    return value


def load_java_verifier(path):
    spec = importlib.util.spec_from_file_location('order_lookup_evidence', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inventory(java, repo, revision):
    return [path for path in java.git(repo, 'ls-tree', '-r', '-z', '--name-only', revision).split('\0') if path]


def probe(java, git_repo, revision):
    with tempfile.TemporaryDirectory(prefix='ftgo-frontend-evidence-') as directory:
        archive = subprocess.check_output(['git', '-C', str(git_repo), 'archive', revision])
        subprocess.run(['tar', '-x', '-C', directory], input=archive, check=True)
        subprocess.run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=directory, check=True,
                       stdout=subprocess.DEVNULL, timeout=120)
        subprocess.run(['npm', 'run', 'build'], cwd=directory, check=True,
                       stdout=subprocess.DEVNULL, timeout=60)
        results = {}
        for order_id in INPUTS:
            text = subprocess.check_output(['node', str(Path(__file__).with_name('probe.mjs')),
                                            directory, order_id], text=True, timeout=30)
            results[order_id] = json.loads(text)
    anchors = [java.anchor(git_repo, revision, path, pattern, group, FRONTEND)
               for group, path, pattern in FRONT]
    return dict(observations=results, trace=anchors, revision=revision)


def evaluate(java, java_repo, result):
    for order_id, observation in result['observations'].items():
        browser = observation['browserRequests']
        gateway = observation['gatewayRequests']
        if len(browser) != 1 or len(gateway) > 1:
            raise ValueError('Unexpected HTTP request count in fixture')
        match = (re.fullmatch(r'/orders/([1-9][0-9]{0,18})', gateway[0]['path'])
                 if gateway and gateway[0]['method'] == 'GET' else None)
        observation['route_matched'] = bool(match)
        observation['repository_id'] = (java.run_repository_probe(java_repo, JAVA_REVISION, match[1])
                                        if match else None)
        observation['preserves_order_id'] = observation['repository_id'] == order_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, type=verify_revision)
    parser.add_argument('--head', required=True, type=verify_revision)
    parser.add_argument('--java-repo', required=True, type=Path)
    parser.add_argument('--java-tool', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    java = load_java_verifier(args.java_tool)
    java_anchors = java.java_graph(args.java_repo, JAVA_REVISION)
    base, head = [probe(java, Path.cwd(), revision) for revision in (args.base, args.head)]
    for version in (base, head):
        evaluate(java, args.java_repo, version)
        version['trace'].extend(java_anchors)
    payload = dict(base=base, head=head, java_revision=JAVA_REVISION, java_package=JAVA_PACKAGE,
                   java_requirement=JAVA_REQUIREMENT, frontend_package=FRONTEND_PACKAGE,
                   frontend_files={side: inventory(java, Path.cwd(), version['revision'])
                                   for side, version in [('base', base), ('head', head)]},
                   java_files=inventory(java, args.java_repo, JAVA_REVISION),
                   changed_files=[path for path in java.git(Path.cwd(), 'diff', '--name-only', '-z',
                                                           args.base, args.head).split('\0') if path])
    args.output.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False)
    (args.output / 'evidence.json').write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    page = Path(__file__).with_name('report.html').read_text(encoding='utf-8')
    (args.output / 'index.html').write_text(page.replace('__EVIDENCE__', serialized.replace('<', r'\u003c')),
                                           encoding='utf-8')
    for order_id in INPUTS:
        before, after = (v['observations'][order_id]['repository_id'] for v in (base, head))
        print(f'Fixture {order_id}: Java findById {before or "unreached"} → {after or "unreached"}')


if __name__ == '__main__':
    main()
