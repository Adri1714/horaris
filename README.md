# Horaris

App per al mòbil per gestionar torns, hores extra i sou. Funciona sense connexió i guarda les dades només al dispositiu.

És independent del projecte Unity: viu en aquesta carpeta, fora d'`Assets/`, i Unity no la llegeix.

## Què fa

- **Avui**: torn del dia, botó per començar i aturar les hores extra, saldo del banc i sou net del mes.
- **Calendari**: assigna torns tocant els dies. Amb el "pinzell" omples molts dies de cop. També pots repetir una setmana o un cicle de diverses setmanes.
- **Banc**: hores extra acumulades que et deu l'empresa, mostrades en dies i hores. Les restes marcant un "Dia compensat" o registrant hores gaudides.
- **Sou**: sou per hores o fix mensual, preu de l'hora extra, pagues extra (prorratejades o no), Seguretat Social, IRPF i plusos fixos.
- **Ajustos**: crear i editar torns (horari, pausa, color), hores per jornada, moneda, tema clar/fosc, i còpia de seguretat o restauració.

## Com provar-la

```bash
cd HorarisApp
python3 -m http.server 8000
```

Obre `http://localhost:8000`.

## Com instal·lar-la al mòbil

Cal publicar la carpeta amb HTTPS, per exemple a GitHub Pages, Netlify o Cloudflare Pages. Després:

- **iPhone (Safari)**: Compartir → "Afegeix a la pantalla d'inici".
- **Android (Chrome)**: menú ⋮ → "Instal·la l'aplicació".

Fes una còpia de seguretat de tant en tant des d'Ajustos, perquè les dades només són al mòbil.
