# Sintetiza SSML em WAV usando o sintetizador de voz embutido no Windows
# (Windows.Media.SpeechSynthesis). Não precisa de internet nem de instalação.
# Uso: powershell -File voz_windows.ps1 -Entrada fala.ssml -Saida fala.wav [-Voz Daniel]
param(
    [Parameter(Mandatory = $true)][string]$Entrada,
    [Parameter(Mandatory = $true)][string]$Saida,
    [string]$Voz = 'Daniel'
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

# Converte as operações assíncronas do WinRT em Task do .NET e espera o resultado
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Aguardar($operacao, [Type]$tipo) {
    $tarefa = $asTask.MakeGenericMethod($tipo).Invoke($null, @($operacao))
    $tarefa.Wait() | Out-Null
    $tarefa.Result
}

$sintetizador = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$escolhida = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
    Where-Object { $_.DisplayName -like "*$Voz*" } | Select-Object -First 1
if (-not $escolhida) {
    # Reserva: qualquer voz em português
    $escolhida = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
        Where-Object { $_.Language -like 'pt*' } | Select-Object -First 1
}
if ($escolhida) { $sintetizador.Voice = $escolhida }

$ssml = [IO.File]::ReadAllText($Entrada, [Text.Encoding]::UTF8)
$fluxo = Aguardar ($sintetizador.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$leitor = New-Object Windows.Storage.Streams.DataReader($fluxo.GetInputStreamAt(0))
$tamanho = [uint32]$fluxo.Size
Aguardar ($leitor.LoadAsync($tamanho)) ([uint32]) | Out-Null
$bytes = New-Object byte[] $tamanho
$leitor.ReadBytes($bytes)
[IO.File]::WriteAllBytes($Saida, $bytes)
