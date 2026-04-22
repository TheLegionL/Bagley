import json
import sys
import time
from pathlib import Path
from typing import Dict, List

try:
    import requests
except ImportError:  # pragma: no cover
    sys.stderr.write('Errore: il modulo "requests" è richiesto. Installa con pip install requests\n')
    raise

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'config' / 'fut-leagues.json'
LEAGUES = [
    {'id': 'premier-league', 'code': 'eng.1', 'name': 'Premier League', 'country': 'Inghilterra'},
    {'id': 'la-liga', 'code': 'esp.1', 'name': 'La Liga', 'country': 'Spagna'},
    {'id': 'serie-a', 'code': 'ita.1', 'name': 'Serie A', 'country': 'Italia'},
    {'id': 'bundesliga', 'code': 'ger.1', 'name': 'Bundesliga', 'country': 'Germania'},
    {'id': 'ligue-1', 'code': 'fra.1', 'name': 'Ligue 1', 'country': 'Francia'}
]
HEADERS = {'user-agent': 'BagleyBot/1.0 (+https://github.com/)'}


def fetch_json(url: str) -> Dict:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_roster(league_code: str, team_id: str) -> List[str]:
    url = f'https://site.api.espn.com/apis/site/v2/sports/soccer/{league_code}/teams/{team_id}?enable=roster'
    data = fetch_json(url)
    players: List[str] = []
    athletes = data.get('team', {}).get('athletes', [])
    for group in athletes:
        for athlete in group.get('items', []):
            name = athlete.get('displayName') or athlete.get('fullName')
            if name:
                players.append(name)
    return players


def resolve_rating(team_info: Dict) -> int:
    power_rank = team_info.get('powerRank')
    if isinstance(power_rank, dict):
        value = power_rank.get('value')
        if isinstance(value, (int, float)):
            return int(value)
    standings = team_info.get('record', {}).get('items', [])
    if standings:
        stats = standings[0].get('stats', [])
        for stat in stats:
            if stat.get('name') == 'pointsFor':
                try:
                    return int(float(stat.get('value')))
                except (TypeError, ValueError):
                    continue
    return 80


def fetch_league_payload(league: Dict) -> Dict:
    teams_url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league['code']}/teams"
    raw = fetch_json(teams_url)
    sport = (raw.get('sports') or [{}])[0]
    league_data = (sport.get('leagues') or [{}])[0]
    teams_payload = []
    for entry in league_data.get('teams', []):
        team_info = entry.get('team') or {}
        team_id = team_info.get('id')
        if not team_id:
            continue
        players = fetch_roster(league['code'], team_id)
        time.sleep(0.2)
        teams_payload.append(
            {
                'id': team_info.get('slug') or team_id,
                'name': team_info.get('displayName') or team_info.get('name'),
                'shortName': team_info.get('abbreviation') or team_info.get('shortDisplayName') or team_info.get('displayName'),
                'rating': resolve_rating(team_info),
                'players': players,
            }
        )
    return {
        'id': league['id'],
        'name': league['name'],
        'country': league['country'],
        'code': league['code'],
        'teams': teams_payload,
    }


def main() -> None:
    payload = {'leagues': []}
    for league in LEAGUES:
        sys.stdout.write(f"Aggiorno {league['name']}...\n")
        payload['leagues'].append(fetch_league_payload(league))
        time.sleep(0.5)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    sys.stdout.write(f'Dati FUT aggiornati in {CONFIG_PATH}\n')


if __name__ == '__main__':
    main()
