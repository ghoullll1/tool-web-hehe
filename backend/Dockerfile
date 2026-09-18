# syntax=docker/dockerfile:1.7
FROM eclipse-temurin:25-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw .
COPY pom.xml .
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 chmod +x mvnw \
    && ./mvnw -B -ntp package -DskipTests

FROM eclipse-temurin:25-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home appuser
WORKDIR /app
COPY --from=build /workspace/target/tool-platform-api-*.jar app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/urandom", "-jar", "/app/app.jar"]
