# Futbobo para Android

O Android usa exatamente o mesmo código e o mesmo `out/` da versão web. Não existe uma cópia separada do jogo.

## Comandos

- `npm run android:apk`: gera o site offline, sincroniza o Capacitor e cria o APK assinado.
- `npm run android:publish`: faz tudo acima, cria a tag da versão de `package.json` e publica `futbobo.apk` no GitHub Releases.
- `npm run android:open`: abre o projeto nativo no Android Studio, se ele estiver instalado.

O botão do site aponta permanentemente para:

`https://github.com/erereck/futbobo/releases/latest/download/futbobo.apk`

## Nova versão

1. Atualize apenas `version` em `package.json`.
2. Faça commit e push normalmente.
3. Execute `npm run android:publish`.

O `versionCode` do Android é calculado automaticamente a partir do número da versão.

## Assinatura

A chave nunca entra no Git. Ela está em `.android-signing/` e possui uma cópia em:

`C:\Users\erick\Documents\Futbobo Android Signing Backup`

Sem essa chave não é possível instalar uma atualização por cima das versões anteriores. Guarde mais uma cópia fora deste computador.
