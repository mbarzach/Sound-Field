#pragma once

#include <JuceHeader.h>
#include <atomic>

class SoundFieldAudioProcessor : public juce::AudioProcessor {
public:
  SoundFieldAudioProcessor();
  ~SoundFieldAudioProcessor() override;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;

  bool isBusesLayoutSupported(const BusesLayout &layouts) const override;

  void processBlock(juce::AudioBuffer<float> &, juce::MidiBuffer &) override;

  juce::AudioProcessorEditor *createEditor() override;
  bool hasEditor() const override;

  const juce::String getName() const override;

  bool acceptsMidi() const override;
  bool producesMidi() const override;
  bool isMidiEffect() const override;
  double getTailLengthSeconds() const override;

  int getNumPrograms() override;
  int getCurrentProgram() override;
  void setCurrentProgram(int index) override;
  const juce::String getProgramName(int index) override;
  void changeProgramName(int index, const juce::String &newName) override;

  void getStateInformation(juce::MemoryBlock &destData) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

  juce::AudioProcessorValueTreeState apvts;

  // Visualization data (thread-safe)
  std::atomic<float> inputLevelL{0.0f};
  std::atomic<float> inputLevelR{0.0f};
  std::atomic<float> outputLevelL{0.0f};
  std::atomic<float> outputLevelR{0.0f};

  std::atomic<float> dryRms{0.0f};
  std::atomic<float> wetRms{0.0f};
  std::atomic<float> dryWidth{0.0f};
  std::atomic<float> wetWidth{0.0f};

  // 10 Octave Band Spectral Analysis (32Hz, 63Hz, 125Hz, 250Hz, 500Hz, 1kHz,
  // 2kHz, 4kHz, 8kHz, 16kHz)
  static constexpr int NUM_BANDS = 10;
  std::atomic<float> spectralBands[NUM_BANDS];

  // Legacy 3-band for backwards compatibility (computed from bands)
  std::atomic<float> spectralLow{0.0f};  // Bands 0-2 average
  std::atomic<float> spectralMid{0.0f};  // Bands 3-6 average
  std::atomic<float> spectralHigh{0.0f}; // Bands 7-9 average

private:
  static juce::AudioProcessorValueTreeState::ParameterLayout
  createParameterLayout();

  juce::SmoothedValue<float> expansionSmooth;
  juce::SmoothedValue<float> excitationSmooth;
  juce::SmoothedValue<float> mixSmooth;
  juce::SmoothedValue<float> outputGainSmooth;
  juce::SmoothedValue<float> inputGainSmooth;

  // Biquad filter coefficients for each band
  struct BiquadCoeffs {
    float b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  };

  // Biquad filter state (z^-1 delays)
  struct BiquadState {
    float z1 = 0, z2 = 0;
  };

  // 10 bands, 2 channels
  BiquadCoeffs bandCoeffs[NUM_BANDS];
  BiquadState bandStates[NUM_BANDS][2];
  double currentSampleRate = 44100.0;

  // Center frequencies for 10 octave bands (ISO standard)
  static constexpr float BAND_FREQUENCIES[NUM_BANDS] = {
      31.5f,   63.0f,   125.0f,  250.0f,  500.0f,
      1000.0f, 2000.0f, 4000.0f, 8000.0f, 16000.0f};

  void calculateBandpassCoeffs(int bandIndex, double sampleRate);

  // Flag to force bypass OFF on first processBlock
  bool firstBlockProcessed = false;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SoundFieldAudioProcessor)
};
