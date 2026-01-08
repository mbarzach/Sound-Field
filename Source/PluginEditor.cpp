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

}

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
                  .withOptionsFrom(bypassRelay)
                  // Event listeners for JavaScript → C++ parameter updates
                  .withEventListener("expansion", [this](const juce::var& data) {
                      handleSliderEvent("expansion", data);
                  })
                  .withEventListener("excitation", [this](const juce::var& data) {
                      handleSliderEvent("excitation", data);
                  })
                  .withEventListener("mix", [this](const juce::var& data) {
                      handleSliderEvent("mix", data);
                  })
                  .withEventListener("inputGain", [this](const juce::var& data) {
                      handleSliderEvent("inputGain", data);
                  })
                  .withEventListener("outputGain", [this](const juce::var& data) {
                      handleSliderEvent("outputGain", data);
                  })
                  .withEventListener("colorTheme", [this](const juce::var& data) {
                      handleSliderEvent("colorTheme", data);
                  })
                  .withEventListener("bypass", [this](const juce::var& data) {
                      handleToggleEvent("bypass", data);
                  })) {
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

    // Broadcast initial parameter values to frontend after WebView loads
    juce::Timer::callAfterDelay(300, [this]() {
      auto emitParam = [this](const juce::String& id, float value) {
        juce::DynamicObject::Ptr obj = new juce::DynamicObject();
        obj->setProperty("scaledValue", value);
        browser.emitEventIfBrowserIsVisible(id, juce::var(obj.get()));
      };

      emitParam("expansion", audioProcessor.apvts.getRawParameterValue("expansion")->load());
      emitParam("excitation", audioProcessor.apvts.getRawParameterValue("excitation")->load());
      emitParam("mix", audioProcessor.apvts.getRawParameterValue("mix")->load());
      emitParam("inputGain", audioProcessor.apvts.getRawParameterValue("inputGain")->load());
      emitParam("outputGain", audioProcessor.apvts.getRawParameterValue("outputGain")->load());
      emitParam("colorTheme", static_cast<float>(audioProcessor.apvts.getRawParameterValue("colorTheme")->load()));

      // Bypass uses different format
      juce::DynamicObject::Ptr bypassObj = new juce::DynamicObject();
      bypassObj->setProperty("value", audioProcessor.apvts.getRawParameterValue("bypass")->load() > 0.5f);
      browser.emitEventIfBrowserIsVisible("bypass", juce::var(bypassObj.get()));
    });

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

void SoundFieldAudioProcessorEditor::handleSliderEvent(const juce::String& id, const juce::var& data) {
    if (!data.hasProperty("value")) return;

    float value = static_cast<float>(data["value"]);

    if (auto* param = audioProcessor.apvts.getParameter(id)) {
        float normalizedValue = param->convertTo0to1(value);
        param->setValueNotifyingHost(normalizedValue);
    }
}

void SoundFieldAudioProcessorEditor::handleToggleEvent(const juce::String& id, const juce::var& data) {
    if (!data.hasProperty("value")) return;

    bool value = static_cast<bool>(data["value"]);

    if (auto* param = audioProcessor.apvts.getParameter(id)) {
        param->setValueNotifyingHost(value ? 1.0f : 0.0f);
    }
}
