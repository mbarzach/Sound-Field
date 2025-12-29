#pragma once

#include "PluginProcessor.h"
#include <JuceHeader.h>

class SoundFieldAudioProcessorEditor : public juce::AudioProcessorEditor,
                                       private juce::Timer {
public:
  explicit SoundFieldAudioProcessorEditor(SoundFieldAudioProcessor &);
  ~SoundFieldAudioProcessorEditor() override;

  void paint(juce::Graphics &) override;
  void resized() override;

private:
  void timerCallback() override;

  SoundFieldAudioProcessor &audioProcessor;

  juce::WebSliderRelay expansionRelay;
  juce::WebSliderRelay excitationRelay;
  juce::WebSliderRelay mixRelay;
  juce::WebSliderRelay outputGainRelay;
  juce::WebSliderRelay inputGainRelay;
  juce::WebSliderRelay colorThemeRelay;
  juce::WebToggleButtonRelay bypassRelay;

  std::unique_ptr<juce::WebSliderParameterAttachment> expansionAttachment;
  std::unique_ptr<juce::WebSliderParameterAttachment> excitationAttachment;
  std::unique_ptr<juce::WebSliderParameterAttachment> mixAttachment;
  std::unique_ptr<juce::WebSliderParameterAttachment> outputGainAttachment;
  std::unique_ptr<juce::WebSliderParameterAttachment> inputGainAttachment;
  std::unique_ptr<juce::WebSliderParameterAttachment> colorThemeAttachment;
  std::unique_ptr<juce::WebToggleButtonParameterAttachment> bypassAttachment;

  juce::WebBrowserComponent browser;
  bool hasNavigated = false;

  // Set to true to use Vite dev server, false to use embedded assets
  // For production, build WebUI (npm run build), embed dist/ as BinaryData,
  // and implement ResourceProvider in the constructor
  static constexpr bool USE_DEV_SERVER = false;
  static constexpr const char *DEV_SERVER_URL = "http://localhost:5173";

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SoundFieldAudioProcessorEditor)
};
