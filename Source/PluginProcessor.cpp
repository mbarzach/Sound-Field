#include "PluginProcessor.h"
#include "PluginEditor.h"

SoundFieldAudioProcessor::SoundFieldAudioProcessor()
    : AudioProcessor(
          BusesProperties()
              .withInput("Input", juce::AudioChannelSet::stereo(), true)
              .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout()) {}

SoundFieldAudioProcessor::~SoundFieldAudioProcessor() {}

juce::AudioProcessorValueTreeState::ParameterLayout
SoundFieldAudioProcessor::createParameterLayout() {
  std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{"inputGain", 1}, "Input Gain",
      juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));

  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{"expansion", 1}, "Expansion",
      juce::NormalisableRange<float>(-100.0f, 100.0f, 1.0f), 0.0f));

  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{"excitation", 1}, "Excitation",
      juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 0.0f));

  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{"mix", 1}, "Dry/Wet Mix",
      juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f), 1.0f));

  params.push_back(std::make_unique<juce::AudioParameterFloat>(
      juce::ParameterID{"outputGain", 1}, "Output Gain",
      juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f), 0.0f));

  params.push_back(std::make_unique<juce::AudioParameterInt>(
      juce::ParameterID{"colorTheme", 1}, "Color Theme", 0, 4, 0));

  params.push_back(std::make_unique<juce::AudioParameterBool>(
      juce::ParameterID{"bypass", 1}, "Bypass", false));

  return {params.begin(), params.end()};
}

const juce::String SoundFieldAudioProcessor::getName() const {
  return JucePlugin_Name;
}

bool SoundFieldAudioProcessor::acceptsMidi() const { return false; }

bool SoundFieldAudioProcessor::producesMidi() const { return false; }

bool SoundFieldAudioProcessor::isMidiEffect() const { return false; }

double SoundFieldAudioProcessor::getTailLengthSeconds() const { return 0.0; }

int SoundFieldAudioProcessor::getNumPrograms() { return 1; }

int SoundFieldAudioProcessor::getCurrentProgram() { return 0; }

void SoundFieldAudioProcessor::setCurrentProgram(int index) {
  juce::ignoreUnused(index);
}

const juce::String SoundFieldAudioProcessor::getProgramName(int index) {
  juce::ignoreUnused(index);
  return {};
}

void SoundFieldAudioProcessor::changeProgramName(int index,
                                                 const juce::String &newName) {
  juce::ignoreUnused(index, newName);
}

void SoundFieldAudioProcessor::prepareToPlay(double sampleRate,
                                             int samplesPerBlock) {
  juce::ignoreUnused(samplesPerBlock);

  currentSampleRate = sampleRate;
  const double smoothTimeSeconds = 0.02;

  expansionSmooth.reset(sampleRate, smoothTimeSeconds);
  excitationSmooth.reset(sampleRate, smoothTimeSeconds);
  mixSmooth.reset(sampleRate, smoothTimeSeconds);
  outputGainSmooth.reset(sampleRate, smoothTimeSeconds);
  inputGainSmooth.reset(sampleRate, smoothTimeSeconds);

  // Initialize 10-band biquad filters
  for (int i = 0; i < NUM_BANDS; ++i) {
    calculateBandpassCoeffs(i, sampleRate);
    // Reset filter states
    bandStates[i][0] = BiquadState{};
    bandStates[i][1] = BiquadState{};
    spectralBands[i].store(0.0f);
  }

  expansionSmooth.setCurrentAndTargetValue(
      *apvts.getRawParameterValue("expansion"));
  excitationSmooth.setCurrentAndTargetValue(
      *apvts.getRawParameterValue("excitation"));
  mixSmooth.setCurrentAndTargetValue(*apvts.getRawParameterValue("mix"));
  outputGainSmooth.setCurrentAndTargetValue(juce::Decibels::decibelsToGain(
      apvts.getRawParameterValue("outputGain")->load()));
  inputGainSmooth.setCurrentAndTargetValue(juce::Decibels::decibelsToGain(
      apvts.getRawParameterValue("inputGain")->load()));

  if (std::abs(apvts.getRawParameterValue("inputGain")->load()) < 0.001f) {
    inputGainSmooth.setCurrentAndTargetValue(1.0f);
  }
  mixSmooth.setCurrentAndTargetValue(*apvts.getRawParameterValue("mix"));
}

// RBJ Bandpass filter coefficient calculation
// Q = 1.414 gives approximately 1 octave bandwidth
void SoundFieldAudioProcessor::calculateBandpassCoeffs(int bandIndex,
                                                       double sampleRate) {
  const float fc = BAND_FREQUENCIES[bandIndex];
  const float Q = 1.414f; // ~1 octave bandwidth

  const float w0 = 2.0f * juce::MathConstants<float>::pi * fc /
                   static_cast<float>(sampleRate);
  const float cosw0 = std::cos(w0);
  const float sinw0 = std::sin(w0);
  const float alpha = sinw0 / (2.0f * Q);

  // Bandpass coefficients (constant 0 dB peak gain)
  const float b0 = alpha;
  const float b1 = 0.0f;
  const float b2 = -alpha;
  const float a0 = 1.0f + alpha;
  const float a1_raw = -2.0f * cosw0;
  const float a2_raw = 1.0f - alpha;

  // Normalize by a0
  bandCoeffs[bandIndex].b0 = b0 / a0;
  bandCoeffs[bandIndex].b1 = b1 / a0;
  bandCoeffs[bandIndex].b2 = b2 / a0;
  bandCoeffs[bandIndex].a1 = a1_raw / a0;
  bandCoeffs[bandIndex].a2 = a2_raw / a0;
}

void SoundFieldAudioProcessor::releaseResources() {}

bool SoundFieldAudioProcessor::isBusesLayoutSupported(
    const BusesLayout &layouts) const {
  if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
    return false;

  if (layouts.getMainInputChannelSet() != juce::AudioChannelSet::stereo())
    return false;

  return true;
}

void SoundFieldAudioProcessor::processBlock(juce::AudioBuffer<float> &buffer,
                                            juce::MidiBuffer &midiMessages) {
  juce::ignoreUnused(midiMessages);

  juce::ScopedNoDenormals noDenormals;

  const int numSamples = buffer.getNumSamples();

  if (buffer.getNumChannels() < 2)
    return;

  // Snap input gain if smoother is still at zero
  float currentGain = inputGainSmooth.getCurrentValue();
  float targetGain = juce::Decibels::decibelsToGain(
      apvts.getRawParameterValue("inputGain")->load());

  if (currentGain < 0.0001f && targetGain > 0.01f) {
    inputGainSmooth.setCurrentAndTargetValue(targetGain);
  }

  const bool bypassed = apvts.getRawParameterValue("bypass")->load() > 0.5f;

  float *leftChannel = buffer.getWritePointer(0);
  float *rightChannel = buffer.getWritePointer(1);

  // Calculate input levels
  float inputSumL = 0.0f, inputSumR = 0.0f;
  for (int i = 0; i < numSamples; ++i) {
    inputSumL += leftChannel[i] * leftChannel[i];
    inputSumR += rightChannel[i] * rightChannel[i];
  }
  inputLevelL.store(std::sqrt(inputSumL / static_cast<float>(numSamples)));
  inputLevelR.store(std::sqrt(inputSumR / static_cast<float>(numSamples)));

  if (bypassed) {
    outputLevelL.store(inputLevelL.load());
    outputLevelR.store(inputLevelR.load());
    dryRms.store(inputLevelL.load());
    wetRms.store(0.0f);
    dryWidth.store(0.0f);
    wetWidth.store(0.0f);
    return;
  }

  expansionSmooth.setTargetValue(*apvts.getRawParameterValue("expansion"));
  excitationSmooth.setTargetValue(*apvts.getRawParameterValue("excitation"));
  mixSmooth.setTargetValue(*apvts.getRawParameterValue("mix"));
  outputGainSmooth.setTargetValue(juce::Decibels::decibelsToGain(
      apvts.getRawParameterValue("outputGain")->load()));
  inputGainSmooth.setTargetValue(juce::Decibels::decibelsToGain(
      apvts.getRawParameterValue("inputGain")->load()));

  float dryRmsSum = 0.0f;
  float wetRmsSum = 0.0f;
  float dryWidthSum = 0.0f;
  float wetWidthSum = 0.0f;

  // 10-band spectral energy accumulators
  float bandEnergy[NUM_BANDS] = {0.0f};

  for (int i = 0; i < numSamples; ++i) {
    const float expansion = expansionSmooth.getNextValue();
    const float excitation = excitationSmooth.getNextValue();
    const float mix = mixSmooth.getNextValue();
    const float outputGain = outputGainSmooth.getNextValue();
    const float inputGain = inputGainSmooth.getNextValue();

    // Apply Input Gain first
    leftChannel[i] *= inputGain;
    rightChannel[i] *= inputGain;

    const float dryLeft = leftChannel[i];
    const float dryRight = rightChannel[i];
    const float dryMono = (dryLeft + dryRight) * 0.5f;

    // 10-Band Spectral Analysis using Biquad Filters
    for (int b = 0; b < NUM_BANDS; ++b) {
      const auto &c = bandCoeffs[b];

      // Process left channel
      float inL = dryLeft;
      float outL = c.b0 * inL + c.b1 * bandStates[b][0].z1 +
                   c.b2 * bandStates[b][0].z2 - c.a1 * bandStates[b][0].z1 -
                   c.a2 * bandStates[b][0].z2;
      // Update left state (Direct Form I simplified)
      bandStates[b][0].z2 = bandStates[b][0].z1;
      bandStates[b][0].z1 = outL;

      // Process right channel
      float inR = dryRight;
      float outR = c.b0 * inR + c.b1 * bandStates[b][1].z1 +
                   c.b2 * bandStates[b][1].z2 - c.a1 * bandStates[b][1].z1 -
                   c.a2 * bandStates[b][1].z2;
      bandStates[b][1].z2 = bandStates[b][1].z1;
      bandStates[b][1].z1 = outR;

      // Accumulate energy (squared mono sum)
      float bandMono = (outL + outR) * 0.5f;
      bandEnergy[b] += bandMono * bandMono;
    }

    // M/S encode
    float mid = (dryLeft + dryRight) * 0.5f;
    float side = (dryLeft - dryRight) * 0.5f;

    // Expansion (stereo width)
    // Map -100..100 to 0.0..2.0
    float expansionFactor = 1.0f + (expansion / 100.0f);
    side *= expansionFactor;

    // Tube saturation using asymmetric power law (generates even harmonics)
    auto tubeSaturate = [](float x, float drive) {
      float driven = x * drive;
      if (driven > 0.0f)
        return std::pow(driven, 1.5f) / std::pow(drive, 0.5f);
      else
        return -std::pow(-driven, 1.3f) / std::pow(drive, 0.3f);
    };

    // Map 0..100 to 1.0..11.0 for drive
    float drive = 1.0f + (excitation / 10.0f);

    // Calculate saturated signal
    float saturatedMid = tubeSaturate(mid, drive);
    float saturatedSide = tubeSaturate(side, drive);

    float saturationMix = excitation / 100.0f;

    mid = mid * (1.0f - saturationMix) + saturatedMid * saturationMix;
    side = side * (1.0f - saturationMix) + saturatedSide * saturationMix;

    // M/S decode
    float wetLeft = mid + side;
    float wetRight = mid - side;

    // Calculate dry and wet metrics for visualization

    float wetMono = (wetLeft + wetRight) * 0.5f;
    dryRmsSum += dryMono * dryMono;
    wetRmsSum += wetMono * wetMono;
    dryWidthSum += std::abs(dryLeft - dryRight);
    wetWidthSum += std::abs(wetLeft - wetRight);

    // Mix dry/wet
    leftChannel[i] = (dryLeft * (1.0f - mix) + wetLeft * mix) * outputGain;
    rightChannel[i] = (dryRight * (1.0f - mix) + wetRight * mix) * outputGain;
  }

  // Store visualization data
  dryRms.store(std::sqrt(dryRmsSum / static_cast<float>(numSamples)));
  wetRms.store(std::sqrt(wetRmsSum / static_cast<float>(numSamples)));
  dryWidth.store(dryWidthSum / static_cast<float>(numSamples));
  wetWidth.store(wetWidthSum / static_cast<float>(numSamples));

  // Store 10-band spectral data with boost for visualization
  const float boost = 15.0f;
  for (int b = 0; b < NUM_BANDS; ++b) {
    spectralBands[b].store(
        std::sqrt(bandEnergy[b] / static_cast<float>(numSamples)) * boost);
  }

  // Legacy 3-band computation (average of band groups)
  float lowAvg = (spectralBands[0].load() + spectralBands[1].load() +
                  spectralBands[2].load()) /
                 3.0f;
  float midAvg = (spectralBands[3].load() + spectralBands[4].load() +
                  spectralBands[5].load() + spectralBands[6].load()) /
                 4.0f;
  float highAvg = (spectralBands[7].load() + spectralBands[8].load() +
                   spectralBands[9].load()) /
                  3.0f;
  spectralLow.store(lowAvg);
  spectralMid.store(midAvg);
  spectralHigh.store(highAvg);

  // Calculate output levels
  float outputSumL = 0.0f, outputSumR = 0.0f;
  for (int i = 0; i < numSamples; ++i) {
    outputSumL += leftChannel[i] * leftChannel[i];
    outputSumR += rightChannel[i] * rightChannel[i];
  }
  outputLevelL.store(std::sqrt(outputSumL / static_cast<float>(numSamples)));
  outputLevelR.store(std::sqrt(outputSumR / static_cast<float>(numSamples)));
}

bool SoundFieldAudioProcessor::hasEditor() const { return true; }

juce::AudioProcessorEditor *SoundFieldAudioProcessor::createEditor() {
  return new SoundFieldAudioProcessorEditor(*this);
}

void SoundFieldAudioProcessor::getStateInformation(
    juce::MemoryBlock &destData) {
  auto state = apvts.copyState();
  std::unique_ptr<juce::XmlElement> xml(state.createXml());
  copyXmlToBinary(*xml, destData);
}

void SoundFieldAudioProcessor::setStateInformation(const void *data,
                                                   int sizeInBytes) {
  std::unique_ptr<juce::XmlElement> xmlState(
      getXmlFromBinary(data, sizeInBytes));

  if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType()))
    apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
}

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() {
  return new SoundFieldAudioProcessor();
}
