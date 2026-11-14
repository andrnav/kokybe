# Photo Quality AI 4.1

Lokali nuotraukų spaudos raiškos ir AI kokybės analizės aplikacija.

## Paleidimas

```bash
npm install
npm run dev
```

## Apkirpimas

- Apkirpimo lango proporcija susiejama su pasirinktu spaudos formatu.
- Originalus vaizdas rodomas išlaikant jo proporcijas, be tempimo.
- Vaizdas tempiamas po apkirpimo langu, priartinamas slankikliu.
- PPI perskaičiuojamas pagal tikrą apkirpimo stačiakampį ir fiksuotą spaudos formatą.
- Patvirtintas apkirpimas išsaugomas kaip PNG iš originalių dekoduotų pikselių, be dirbtinio raiškos didinimo.
- AI gauna tą patį patvirtintą PNG apkirpimą.

Pastaba: naršyklė gali riboti labai didelių nuotraukų dekodavimo / canvas dydį. PNG išsaugo apkirptų pikselių informaciją be JPEG pakartotinio suspaudimo, bet tai neatkuria informacijos, kurios nebuvo originale.
