# generate-wav.ps1
# Generates a benchmark WAV file using Windows SAPI (built-in, no external tools needed).
# Output: benchmark-audio.wav (16-bit PCM, 22050 Hz, mono)
# Rate 8 ≈ ~175-185 wpm (fast speaker pace).

param(
  [string]$OutPath = "$PSScriptRoot\benchmark-audio.wav",
  [int]$Rate = 8
)

$text = @"
Good morning everyone and welcome to the International Medical Conference on Cardiovascular Surgery.
Today we will discuss the latest advancements in minimally invasive cardiac procedures including
transcatheter aortic valve replacement and robotic assisted coronary artery bypass grafting.
Our first speaker will present findings from a multicenter randomized controlled trial involving
four thousand two hundred patients across seventeen hospitals in nine countries.
The primary endpoint was thirty day mortality and secondary endpoints included stroke rate
myocardial infarction rehospitalization and quality of life measures at six months and one year follow up.
Patients were randomized one to one to receive either the standard surgical approach or the novel endoscopic technique.
Results showed a statistically significant reduction in thirty day mortality from four point two percent
in the surgical group to one point eight percent in the endoscopic group with a p value of less than zero point zero zero one.
Secondary outcomes also favored the endoscopic approach with lower stroke rates shorter intensive care unit stays
and faster return to normal activity.
"@

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate   = $Rate
$synth.Volume = 100

$synth.SetOutputToWaveFile($OutPath)
$synth.Speak($text.Trim())
$synth.SetOutputToDefaultAudioDevice()
$synth.Dispose()

$sizeMB = [math]::Round((Get-Item $OutPath).Length / 1MB, 2)
Write-Host "Generated: $OutPath ($sizeMB MB)"
