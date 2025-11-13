# Gate.io Grid Bot

Aplikacja full-stack do konfiguracji i uruchamiania strategii grid trading na giełdzie Gate.io.
Frontend umożliwia wprowadzenie parametrów, podgląd na żywo notowań oraz uruchomienie bota. Backend w FastAPI przygotowuje siatkę zleceń i (opcjonalnie) wysyła je do Gate.io.

## Szybki start

1. Zainstaluj zależności:

   ```bash
   pip install -r requirements.txt
   ```

2. Uruchom serwer deweloperski:

   ```bash
   uvicorn backend.main:app --reload
   ```

3. Otwórz przeglądarkę i przejdź pod adres `http://localhost:8000`, aby skorzystać z interfejsu webowego.

## Tryb offline

Jeżeli chcesz jedynie szybko zaprezentować interfejs lub przeprowadzić wstępną
symulację bez uruchamiania backendu, otwórz plik
[`frontend/offline.html`](frontend/offline.html) bezpośrednio w przeglądarce.
Strona działa w pełni lokalnie, prezentując syntetyczny wykres oraz obliczając
siatkę zleceń zgodnie z podanymi parametrami.

## Bezpieczeństwo

- Dane API są wykorzystywane jedynie do podpisywania żądań wychodzących do Gate.io.
- Domyślnie aplikacja działa w trybie dry-run i nie składa rzeczywistych zleceń. Aby złożyć prawdziwe zlecenia, odznacz opcję „Tryb testowy”.
- Przed uruchomieniem na żywo upewnij się, że Twoje limity i wolumeny są zgodne z wymaganiami rynku.

## Architektura

- **backend/** – logika FastAPI, klient REST Gate.io oraz implementacja strategii, a także publiczne endpointy do danych rynkowych (świece i ticker).
- **frontend/** – statyczny interfejs HTML/CSS/JS renderowany przez FastAPI z wykresem ceny aktualizowanym w czasie rzeczywistym.
- **requirements.txt** – lista zależności.

## Testowanie

Polecenie poniżej sprawdza poprawność składni modułów Pythona:

```bash
python -m compileall backend
```

## Licencja

Projekt dostarczany jest „as is”. Korzystaj na własną odpowiedzialność.
