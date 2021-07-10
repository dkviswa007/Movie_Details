"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.Processor = void 0;
const _ = require("lodash");
const escapeHtml = require("escape-html");
const Constants_1 = require("./Constants");
const IO_1 = require("../utils/IO");
const mustache = require("mustache");
const path = require("path");
const Logger_1 = require("../utils/Logger");
const chalk = require("chalk");
const Dependencies_1 = require("./Dependencies");
const util_1 = require("util");
const Config_1 = require("./Config");
const ImageSnapshotDifference_1 = require("../render/diff/ImageSnapshotDifference");
class Processor {
  constructor(mResults, mExplicitConfig, mProcessParms) {
    this.mResults = mResults;
    this.mExplicitConfig = mExplicitConfig;
    this.mProcessParms = mProcessParms;
  }
  static run(results, explicitConfig, parms) {
    return new Processor(results, explicitConfig, parms).generate();
  }
  getEvaluationResultStatus(status) {
    switch (status) {
      case "passed":
        return "CORRECT";
      case "failed":
        return "INCORRECT";
      case "pending":
      default:
        return "INCORRECT";
    }
  }
  generate() {
    const substitute = {};
    const substituteWithCustomData = {};
    if (util_1.isNullOrUndefined(this.mResults)) {
      throw new Error(Constants_1.Constants.NO_INPUT);
    }
    const config = new Config_1.Config(
      this.logger,
      this.mExplicitConfig,
      this.mProcessParms
    ).buildConfig();
    const results = this.mResults;
    results.testResults = this.mResults.testResults.map((eachSuite) => {
      eachSuite.testResults = eachSuite.testResults.map((eachTest) => {
        if (!eachTest.id && eachTest.ancestorTitles && eachTest.fullName) {
          const ancestorTitles = eachTest.ancestorTitles.map(
            (eachAncestorTitle) => eachAncestorTitle.split(":::")[2]
          );
          const idAndTitle = eachTest.title.split(":::");
          const fullName = ancestorTitles.join(" ").concat(idAndTitle[2]);
          eachTest.id = idAndTitle[1];
          eachTest.title = idAndTitle[2];
          eachTest.ancestorTitles = ancestorTitles;
          eachTest.fullName = fullName;
        }
        return eachTest;
      });
      return eachSuite;
    });
    const customConfigResults = results.testResults.map((eachTestSuite) => {
      return eachTestSuite.testResults.map((eachTest) => {
        return {
          test_case_id: eachTest.id,
          evaluation_result: this.getEvaluationResultStatus(eachTest.status),
        };
      });
    });
    const flattenedResults = _.flatten(customConfigResults);
    const resultsData = {
      test_case_results: flattenedResults,
    };
    substitute.results = results;
    substitute.rawResults = JSON.stringify(results, null, 2);
    substitute.jestStareConfig = config;
    substitute.rawJestStareConfig = JSON.stringify(config, null, 2);
    substituteWithCustomData.results = resultsData;
    substituteWithCustomData.rawResults = JSON.stringify(resultsData, null, 2);
    substituteWithCustomData.jestStareConfig = config;
    substituteWithCustomData.rawJestStareConfig = JSON.stringify(
      config,
      null,
      2
    );
    if (this.mProcessParms && this.mProcessParms.reporter) {
      this.mProcessParms.reporter.jestStareConfig = config;
      substitute.globalConfig = JSON.stringify(
        this.mProcessParms.reporter.mGlobalConfig,
        null,
        2
      );
    }
    this.generateReport(
      config.resultDir,
      substitute,
      this.mProcessParms,
      substituteWithCustomData
    );
    this.collectImageSnapshots(config.resultDir, this.mResults);
    if (config.additionalResultsProcessors != null) {
      this.execute(this.mResults, config.additionalResultsProcessors);
    }
    return this.mResults;
  }
  collectImageSnapshots(resultDir, results) {
    results.testResults.forEach((rootResult) => {
      if (rootResult.numFailingTests) {
        rootResult.testResults.forEach((testResult) => {
          testResult.failureMessages.forEach((failureMessage) => {
            if (
              typeof failureMessage === "string" &&
              ImageSnapshotDifference_1.ImageSnapshotDifference.containsDiff(
                failureMessage
              )
            ) {
              const diffImagePath = ImageSnapshotDifference_1.ImageSnapshotDifference.parseDiffImagePath(
                failureMessage
              );
              const diffImageName = ImageSnapshotDifference_1.ImageSnapshotDifference.parseDiffImageName(
                failureMessage
              );
              if (IO_1.IO.existsSync(diffImagePath)) {
                IO_1.IO.mkdirsSync(
                  resultDir + Constants_1.Constants.IMAGE_SNAPSHOT_DIFF_DIR
                );
                const reportDiffImagePath =
                  resultDir +
                  Constants_1.Constants.IMAGE_SNAPSHOT_DIFF_DIR +
                  diffImageName;
                IO_1.IO.copyFileSync(diffImagePath, reportDiffImagePath);
              }
            }
          });
        });
      }
    });
  }
  e(str) {
    return escapeHtml(str).replace(/&#39/g, "&#x27");
  }
  createBaseHtml(substitute) {
    const head = `<head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>jest-stare!</title>
            <link href="https://unpkg.com/tailwindcss@^1.0/dist/tailwind.min.css" rel="stylesheet">
            <link rel="preconnect" href="https://fonts.gstatic.com">
	        <link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet">
            <script src="https://kit.fontawesome.com/522ee478c4.js" crossorigin="anonymous"></script>
            <script src="js/view.js"></script>
        </head>`;
    const body = `<body><div id="test-results" style=" display: flex; flex-direction: column; width: 80%; padding: 25px 0px; margin: auto; font-family: roboto;  margin-top:60px;">${this.e(
      substitute.rawResults
    )}</div></body>`;
    const html = `<html lang="en">${head}${body}</html>`;
    return html;
  }

  generateReport(resultDir, substitute, parms, substituteWithCustomData) {
    IO_1.IO.mkdirsSync(resultDir);
    IO_1.IO.writeFileSync(
      resultDir + substitute.jestStareConfig.resultJson,
      substituteWithCustomData.rawResults
    );
    if (substitute.jestStareConfig.jestStareConfigJson) {
      IO_1.IO.writeFileSync(
        resultDir + substitute.jestStareConfig.jestStareConfigJson,
        substitute.rawJestStareConfig
      );
    }
    if (
      substitute.globalConfig &&
      substitute.jestStareConfig.jestGlobalConfigJson
    ) {
      IO_1.IO.writeFileSync(
        resultDir + substitute.jestStareConfig.jestGlobalConfigJson,
        substitute.globalConfig
      );
    }
    if (
      substitute.jestStareConfig.report != null &&
      !substitute.jestStareConfig.report
    ) {
      return;
    }
    IO_1.IO.writeFileSync(
      resultDir + substitute.jestStareConfig.resultHtml,
      this.createBaseHtml(substitute)
    );
    // IO_1.IO.writeFileSync(resultDir + substitute.jestStareConfig.resultHtml, mustache.render(this.obtainWebFile(Constants_1.Constants.TEMPLATE_HTML), substitute));
    //const cssDir = resultDir + Constants_1.Constants.CSS_DIR;
    //IO_1.IO.mkdirsSync(cssDir);
    //IO_1.IO.writeFileSync(cssDir + Constants_1.Constants.JEST_STARE_CSS, this.obtainWebFile(Constants_1.Constants.JEST_STARE_CSS));
    const jsDir = resultDir + Constants_1.Constants.JS_DIR;
    IO_1.IO.mkdirsSync(jsDir);
    IO_1.IO.writeFileSync(
      jsDir + Constants_1.Constants.JEST_STARE_JS,
      this.obtainJsRenderFile(Constants_1.Constants.JEST_STARE_JS)
    );
    Dependencies_1.Dependencies.THIRD_PARTY_DEPENDENCIES.forEach(
      (dependency) => {
        const updatedDependency = Object.assign({}, ...[dependency]);
        updatedDependency.targetDir = resultDir + dependency.targetDir;
        this.addThirdParty(updatedDependency);
      }
    );
    let type = " ";
    type +=
      parms && parms.reporter
        ? Constants_1.Constants.REPORTERS
        : Constants_1.Constants.TEST_RESULTS_PROCESSOR;
    //this.logger.info(Constants_1.Constants.LOGO + type + Constants_1.Constants.LOG_MESSAGE + resultDir + substitute.jestStareConfig.resultHtml + Constants_1.Constants.SUFFIX);
  }
  execute(jestTestData, processors) {
    for (const processor of processors) {
      if (processor === Constants_1.Constants.NAME) {
        this.logger.error(
          "Error: In order to avoid infinite loops, " +
            "jest-stare cannot be listed as an additional processor. Skipping... "
        );
        continue;
      }
      try {
        require(processor)(jestTestData);
        this.logger.info(
          Constants_1.Constants.LOGO +
            " passed results to additional processor " +
            chalk.white('"' + processor + '"') +
            Constants_1.Constants.SUFFIX
        );
      } catch (e) {
        this.logger.error(
          'Error executing additional processor: "' + processor + '" ' + e
        );
      }
    }
  }
  addThirdParty(dependency) {
    return __awaiter(this, void 0, void 0, function* () {
      const location = require.resolve(dependency.requireDir + dependency.file);
      yield IO_1.IO.writeFileSync(
        dependency.targetDir + dependency.file,
        IO_1.IO.readFileSync(location)
      );
    });
  }
  obtainWebFile(name) {
    return IO_1.IO.readFileSync(path.resolve(__dirname + "/../../web/" + name));
  }
  obtainJsRenderFile(name) {
    return IO_1.IO.readFileSync(path.resolve(__dirname + "/../render/" + name));
  }
  set logger(logger) {
    this.mLog = logger;
  }
  get logger() {
    if (util_1.isNullOrUndefined(this.mLog)) {
      this.logger = new Logger_1.Logger();
    }
    return this.mLog;
  }
}
exports.Processor = Processor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3Byb2Nlc3Nvci9Qcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQzVCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMxQywyQ0FBd0M7QUFFeEMsb0NBQWlDO0FBQ2pDLHFDQUFxQztBQUNyQyw2QkFBNkI7QUFFN0IsNENBQXlDO0FBQ3pDLCtCQUErQjtBQUUvQixpREFBOEM7QUFDOUMsK0JBQXlDO0FBRXpDLHFDQUFrQztBQUNsQyxvRkFBaUY7QUFVakYsTUFBYSxTQUFTO0lBK0JsQixZQUFvQixRQUEwQixFQUFVLGVBQWtDLEVBQVUsYUFBNkI7UUFBN0csYUFBUSxHQUFSLFFBQVEsQ0FBa0I7UUFBVSxvQkFBZSxHQUFmLGVBQWUsQ0FBbUI7UUFBVSxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7SUFBRyxDQUFDO0lBcEI5SCxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQXlCLEVBQUUsY0FBaUMsRUFBRSxLQUFxQjtRQUNqRyxPQUFPLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDcEUsQ0FBQztJQW9CRCx5QkFBeUIsQ0FBQyxNQUFNO1FBQzVCLFFBQVEsTUFBTSxFQUFFO1lBQ1osS0FBSyxRQUFRO2dCQUNULE9BQU8sU0FBUyxDQUFBO1lBQ3BCLEtBQUssUUFBUTtnQkFDVCxPQUFPLFdBQVcsQ0FBQTtZQUN0QixLQUFLLFNBQVMsQ0FBQztZQUNmO2dCQUNBLE9BQU8sV0FBVyxDQUFBO1NBQ3JCO0lBQ0wsQ0FBQztJQVFPLFFBQVE7UUFDWixNQUFNLFVBQVUsR0FBZ0IsRUFBRSxDQUFDO1FBQ25DLE1BQU0sd0JBQXdCLEdBQVUsRUFBRSxDQUFDO1FB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
