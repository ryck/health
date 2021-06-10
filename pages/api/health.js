import Status from "http-status-codes";

/**
 * Format the sample to a more friendly data structure
 * @param {values: string; timestamps: string;} entry
 * @returns {Array<{ value: number; timestamp: string }>}
 */
const formathealthSample = (entry) => {
  /**
   * We destructure the sample entry based on the structure defined in the dictionaries
   * in the Get Content Of action of our shortcut
   */
  const { values, timestamps } = entry;

  const formattedSample = values
    // split the string by \n to obtain an array of values
    .split("\n")
    // [Edge case] filter out any potential empty strings, these happen when a new day starts and no values have been yet recorded
    .filter((item) => item !== "")
    .map((item, index) => {
      return {
        value: parseInt(item, 10),
        timestamp: new Date(timestamps.split("\n")[index]).toISOString(),
      };
    });

  return formattedSample;
};

import { GraphQLClient, gql } from "graphql-request";

const URI = "https://graphql.fauna.com/graphql";

/**
 * Initiate the GraphQL client
 */
const graphQLClient = new GraphQLClient(URI, {
  headers: {
    authorization: `Bearer ${process.env.FAUNA_KEY}`, // don't hardcode the key in your codebase, use environment variables and/or secrets :)
  },
});

/**
 * The handler of serverless function
 * @param {NowRequest} req
 * @param {NowResponse} res
 */
const handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(Status.BAD_REQUEST).send({ error: "Bad request" });
  }

  const key = req.headers[`x-key`];

  if (key !== process.env.API_KEY) {
    return res.status(Status.FORBIDDEN).json({ error: "Unauthorized" });
  }

  /**
   * Destructure the body of the request based on the payload defined in the shortcut
   */
  const { heart, steps, date: deviceDate } = req.body;

  // console.log("heart", heart);
  // console.log("steps", steps);
  // console.log("deviceDate", deviceDate);

  /**
   * Format the steps data
   */
  const formattedStepsData = formathealthSample(steps);
  console.info(
    `Steps: ${
      formattedStepsData.filter((item) => item.value !== 0).length
    } items`
  );

  /**
   * Format the heart data
   */
  const formattedHeartData = formathealthSample(heart);
  console.info(`Heart Rate: ${formattedHeartData.length} items`);

  /**
   * Variable "today" is a date set based on the device date at midninight
   * This will be used as way to timestamp our documents in the database
   */
  const today = new Date(`${deviceDate}T00:00:00.000Z`);

  const entry = {
    heartRate: formattedHeartData,
    steps: formattedStepsData,
    date: today.toISOString(),
  };

  // console.log(entry);

  const mutation = gql`
    mutation ($entries: [EntryInput]) {
      addEntry(entries: $entries) {
        heartRate {
          value
          timestamp
        }
        steps {
          value
          timestamp
        }
        date
      }
    }
  `;

  try {
    await graphQLClient.request(mutation, {
      entries: [entry],
    });
    console.info(
      "Successfully transfered heart rate and steps data to database"
    );
  } catch (error) {
    console.error(error);
    return res
      .status(Status.SERVICE_UNAVAILABLE)
      .json({ response: error.response.errors[0].message });
  }

  return res.status(Status.OK).json({
    response: {
      date: today.toISOString(),
      heart: `${formattedHeartData.length}`,
      steps: `${formattedStepsData.filter((item) => item.value !== 0).length}`,
    },
  });
};

export default handler;
