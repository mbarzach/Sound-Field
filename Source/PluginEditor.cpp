#include "PluginEditor.h"
#include "PluginProcessor.h"
#include "BinaryData.h"

namespace {

const char* getMimeType(const juce::String& path) {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".js"))   return "text/javascript";
    if (path.endsWith(".css"))  return "text/css";
    if (path.endsWith(".svg"))  return "image/svg+xml";
    if (path.endsWith(".png"))  return "image/png";
    if (path.endsWith(".json")) return "application/json";
    return "application/octet-stream";
}

std::optional<juce::WebBrowserComponent::Resource> getResource(const juce::String& url) {
    // Extract path from URL
    juce::String path = url;
    if (path == "/" || path.isEmpty())
        path = "index.html";
    else
        path = path.fromFirstOccurrenceOf("/", false, false);

    // Get just the filename (Projucer uses filename only, not path)
    // "/assets/index.js" -> "index.js"
    juce::String filename = path.fromLastOccurrenceOf("/", false, false);
    if (filename.isEmpty())
        filename = path;

    // BinaryData naming: dots become underscores
    // "index.js" -> "index_js"
    juce::String resourceName = filename.replace(".", "_");

    int size = 0;
    const char* data = BinaryData::getNamedResource(resourceName.toRawUTF8(), size);

    if (data != nullptr && size > 0) {
        std::vector<std::byte> bytes(static_cast<size_t>(size));
        std::memcpy(bytes.data(), data, static_cast<size_t>(size));
        return juce::WebBrowserComponent::Resource{ std::move(bytes), getMimeType(filename) };
    }

    DBG("Resource not found: " << url << " (looked for: " << resourceName << ")");
    return std::nullopt;
}

} // anonymous namespace

SoundFieldAudioProcessorEditor::SoundFieldAudioProcessorEditor(
    SoundFieldAudioProcessor &p)
    : AudioProcessorEditor(&p), audioProcessor(p), expansionRelay("expansion"),
      excitationRelay("excitation"), mixRelay("mix"),
      outputGainRelay("outputGain"), inputGainRelay("inputGain"),
      colorThemeRelay("colorTheme"), bypassRelay("bypass"),
      browser(juce::WebBrowserComponent::Options{}
                  .withNativeIntegrationEnabled()
                  .withResourceProvider([](const juce::String& url) {
                      return getResource(url);
                  })
                  .withOptionsFrom(expansionRelay)
                  .withOptionsFrom(excitationRelay)
                  .withOptionsFrom(mixRelay)
                  .withOptionsFrom(outputGainRelay)
                  .withOptionsFrom(inputGainRelay)
                  .withOptionsFrom(colorThemeRelay)
                  .withOptionsFrom(bypassRelay)) {
  expansionAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("expansion"), expansionRelay, nullptr);

  excitationAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("excitation"), excitationRelay,
      nullptr);

  mixAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("mix"), mixRelay, nullptr);

  outputGainAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("outputGain"), outputGainRelay,
      nullptr);

  inputGainAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("inputGain"), inputGainRelay, nullptr);

  colorThemeAttachment = std::make_unique<juce::WebSliderParameterAttachment>(
      *audioProcessor.apvts.getParameter("colorTheme"), colorThemeRelay,
      nullptr);

  bypassAttachment = std::make_unique<juce::WebToggleButtonParameterAttachment>(
      *audioProcessor.apvts.getParameter("bypass"), bypassRelay, nullptr);

  addAndMakeVisible(browser);
  setSize(800, 600);

  // Start a one-shot timer to load URL after WebView is fully initialized
  startTimer(500);
}

SoundFieldAudioProcessorEditor::~SoundFieldAudioProcessorEditor() {
  stopTimer();
}

void SoundFieldAudioProcessorEditor::paint(juce::Graphics &g) {
  g.fillAll(juce::Colours::black);
}

void SoundFieldAudioProcessorEditor::resized() {
  browser.setBounds(getLocalBounds());
}

void SoundFieldAudioProcessorEditor::timerCallback() {
  // First timer call: load URL, then switch to data update timer
  if (!hasNavigated) {
    hasNavigated = true;
    stopTimer();

    if constexpr (USE_DEV_SERVER) {
      DBG("Loading WebView URL: " << DEV_SERVER_URL);
      browser.goToURL(DEV_SERVER_URL);
    } else {
      auto resourceRoot = juce::WebBrowserComponent::getResourceProviderRoot();
      DBG("Loading WebView from embedded resources");
      browser.goToURL(resourceRoot);
    }

    // Start the data update timer at 15Hz
    startTimerHz(15);
    return;
  }

  juce::DynamicObject::Ptr data = new juce::DynamicObject();

  // Dry/Wet visualization data
  data->setProperty("dryRms", audioProcessor.dryRms.load());
  data->setProperty("wetRms", audioProcessor.wetRms.load());
  data->setProperty("dryWidth", audioProcessor.dryWidth.load());
  data->setProperty("wetWidth", audioProcessor.wetWidth.load());

  // Level meters
  data->setProperty("inputL", audioProcessor.inputLevelL.load());
  data->setProperty("inputR", audioProcessor.inputLevelR.load());
  data->setProperty("outputL", audioProcessor.outputLevelL.load());
  data->setProperty("outputR", audioProcessor.outputLevelR.load());

  data->setProperty("spectralLow", audioProcessor.spectralLow.load());
  data->setProperty("spectralMid", audioProcessor.spectralMid.load());
  data->setProperty("spectralHigh", audioProcessor.spectralHigh.load());

  juce::Array<juce::var> bandsArray;
  for (int i = 0; i < SoundFieldAudioProcessor::NUM_BANDS; ++i) {
    bandsArray.add(audioProcessor.spectralBands[i].load());
  }
  data->setProperty("spectralBands", bandsArray);

  data->setProperty(
      "cppBypass",
      audioProcessor.apvts.getRawParameterValue("bypass")->load() > 0.5f);

  browser.emitEventIfBrowserIsVisible("audioAnalysis", juce::var(data.get()));
}
